// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./VehicleLib.sol";
import "./IVehicleContracts.sol";

/**
 * @title PUCToken
 * @dev Pollution Under Control (PUC) certificate registry.
 *      Vehicle-bound — keyed by ownTid, not by owner wallet.
 *      PUC validity remains with the vehicle across all ownership changes.
 *
 * ROLES:
 * - ADMIN_ROLE:  Manage PUC centers
 * - PUC_ROLE:    Issue certificates (PUC center wallets)
 * - SYSTEM_ROLE: Called by DVP during scrapVehicle to terminate PUC records
 */
contract PUCToken is AccessControl {
    using VehicleLib for address;
    using VehicleLib for uint256;

    bytes32 public constant ADMIN_ROLE  = keccak256("ADMIN");
    bytes32 public constant PUC_ROLE    = keccak256("PUC");
    bytes32 public constant SYSTEM_ROLE = keccak256("SYSTEM");

    // ── BSVI Emission Standards (India) ────────────────────────────────────
    // Values in 0.01 units (e.g. CO = 100 means 1.00%)
    // These are maximum permissible limits — readings ABOVE these = FAIL
    uint16 public constant MAX_CO    = 1000;  // 10.00% for petrol (0.30% for diesel BS-VI)
    uint16 public constant MAX_HC    = 300;   // 300 ppm HC
    uint16 public constant MAX_SMOKE = 750;   // 75.0% smoke opacity (Hartridge scale)

    error CenterExists();
    error EntityExists();
    error CenterNotActive();
    error CenterNotFound();
    error CertNotFound();
    error NotExpired();
    error VehicleNotFound();
    error VehicleNotActive();
    error OwnershipContractNotSet();
    error ExpiryInPast();
    error EmissionsOutOfBounds();
    error OwnershipContractAlreadySet();

    struct Center {
        uint64  id;
        address auth;
        bool    active;
    }

    struct PUC {
        uint64  certId;
        uint64  ownTid;
        uint64  centerId;
        uint32  issueDate;
        uint32  expiryDate;
        uint16  co;
        uint16  hc;
        uint16  smoke;
        bool    passed;
        bool    valid;
    }

    uint64 private _certCtr;
    uint64 private _centerCtr;

    IOwnershipToken public ownershipContract;

    mapping(string  => uint64)  public centerCode;
    mapping(uint64  => Center)  public centers;
    mapping(address => uint64)  public addrToCenter;
    mapping(uint256 => PUC)     public pucs;

    /// @dev Points to the most recent PASSED certificate for each vehicle
    mapping(uint256 => uint256) public ownToPUC;

    event CenterReg(uint64 indexed id, string code, address auth);
    event CenterStatusToggled(uint64 indexed id, bool active);
    event PUCIssued(uint64 indexed certId, uint256 indexed ownTid, bool passed, uint32 expiry);
    event PUCExpired(uint64 indexed certId);
    event PUCTerminated(uint64 indexed certId, uint256 indexed ownTid);
    event OwnershipContractLinked(address ownershipContract);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    // ========================================================================
    // ADMIN — CONTRACT LINKING
    // ========================================================================

    function setOwnershipContract(address _own) external onlyRole(ADMIN_ROLE) {
        if (address(ownershipContract) != address(0)) revert OwnershipContractAlreadySet();
        _own.validateAddress();
        ownershipContract = IOwnershipToken(_own);
        emit OwnershipContractLinked(_own);
    }

    // ========================================================================
    // PUC CENTER MANAGEMENT
    // ========================================================================

    /**
     * @dev Register PUC center
     */
    function regCenter(string calldata code, address auth) external onlyRole(ADMIN_ROLE) {
        if (centerCode[code] != 0) revert CenterExists();
        if (addrToCenter[auth] != 0) revert EntityExists();
        auth.validateAddress();

        _centerCtr++;
        centers[_centerCtr]    = Center(_centerCtr, auth, true);
        centerCode[code]       = _centerCtr;
        addrToCenter[auth]     = _centerCtr;
        _grantRole(PUC_ROLE, auth);

        emit CenterReg(_centerCtr, code, auth);
    }

    /**
     * @dev Toggle center status
     */
    function toggleCenterStatus(string calldata code) external onlyRole(ADMIN_ROLE) {
        uint64 centerId = centerCode[code];
        if (centerId == 0) revert CenterNotFound();

        bool newState = !centers[centerId].active;
        centers[centerId].active = newState;
        
        if (newState) {
            _grantRole(PUC_ROLE, centers[centerId].auth);
        } else {
            _revokeRole(PUC_ROLE, centers[centerId].auth);
        }
        
        emit CenterStatusToggled(centerId, newState);
    }

    /**
     * @dev Check if PUC center is active
     */
    function isCenterActive(string calldata code) external view returns (bool) {
        uint64 centerId = centerCode[code];
        if (centerId == 0) return false;
        return centers[centerId].active;
    }

    // ========================================================================
    // PUC CERTIFICATE MANAGEMENT
    // ========================================================================

    /**
     * @dev Issue a PUC certificate for a vehicle.
     *      ALWAYS records the test result — even failures are stored permanently.
     *      This prevents corrupt PUC centers from hiding failed tests.
     *
     *      Only PASSED tests update the ownToPUC pointer (current valid PUC).
     *      Failed tests are stored as historical records only.
     *
     *      Validates vehicle exists and is active. Validates emission readings
     *      are within BSVI regulatory bounds.
     */
    function issuePUC(
        uint256 ownTid,
        uint32  expiryDate,
        uint16  co,
        uint16  hc,
        uint16  smoke,
        bool    passed
    ) external onlyRole(PUC_ROLE) returns (uint64) {
        // Validate expiry date (only required for passing tests)
        if (passed && expiryDate <= uint32(block.timestamp)) revert ExpiryInPast();

        // Revert if a corrupt center tries to mark a failed test as passed
        if (passed && (co > MAX_CO || hc > MAX_HC || smoke > MAX_SMOKE)) revert EmissionsOutOfBounds();

        // Validate vehicle exists and is active
        if (address(ownershipContract) == address(0)) revert OwnershipContractNotSet();
        
        (bool exists, bool active) = ownershipContract.existsAndIsActive(ownTid);
        if (!exists) revert VehicleNotFound();
        if (!active) revert VehicleNotActive();

        uint64 centerId = addrToCenter[msg.sender];
        if (!centers[centerId].active) revert CenterNotActive();

        // Invalidate previous PUC if this is a passing test replacing it
        if (passed) {
            uint256 existingCertId = ownToPUC[ownTid];
            if (existingCertId != 0 && pucs[existingCertId].valid) {
                pucs[existingCertId].valid = false;
            }
        }

        _certCtr++;
        uint64 certId = _certCtr;

        // ALWAYS store the result — passed or failed — as a permanent on-chain record
        pucs[certId] = PUC({
            certId:    certId,
            ownTid:    ownTid.toUint64(),
            centerId:  centerId,
            issueDate: uint32(block.timestamp),
            expiryDate: passed ? expiryDate : 0,
            co:        co,
            hc:        hc,
            smoke:     smoke,
            passed:    passed,
            valid:     passed    // Only valid if passed
        });

        // Only update the "current valid PUC" pointer if this test PASSED
        if (passed) {
            ownToPUC[ownTid] = certId;
        }

        emit PUCIssued(certId, ownTid, passed, passed ? expiryDate : 0);
        return certId;
        // NOTE: No revert on failure — transaction succeeds, failure is on-chain record
    }

    /**
     * @dev Mark a PUC certificate as expired. Restricted to PUC_ROLE.
     */
    function markExpired(uint64 certId) external onlyRole(PUC_ROLE) {
        if (pucs[certId].certId == 0) revert CertNotFound();
        if (block.timestamp <= pucs[certId].expiryDate) revert NotExpired();

        pucs[certId].valid = false;
        emit PUCExpired(certId);
    }

    /**
     * @dev Terminate the PUC certificate when a vehicle is scrapped.
     *      Called by DVP.scrapVehicle() via SYSTEM_ROLE.
     */
    function terminatePUC(uint256 ownTid) external onlyRole(SYSTEM_ROLE) {
        uint256 certId = ownToPUC[ownTid];
        if (certId != 0 && pucs[certId].valid) {
            pucs[certId].valid = false;
            emit PUCTerminated(uint64(certId), ownTid);
        }
        // No revert if no active PUC — scrap should succeed regardless
    }

    // ========================================================================
    // VIEW FUNCTIONS
    // ========================================================================

    /**
     * @dev Returns true if the vehicle has a valid, passed, unexpired PUC certificate.
     */
    function isPUCValid(uint256 ownTid) external view returns (bool) {
        uint256 certId = ownToPUC[ownTid];
        if (certId == 0) return false;

        PUC memory puc = pucs[certId];
        return puc.valid && puc.passed && block.timestamp <= puc.expiryDate;
    }

    function getPUC(uint64 certId) external view returns (PUC memory) {
        if (pucs[certId].certId == 0) revert CertNotFound();
        return pucs[certId];
    }

    /**
     * @dev Get PUC certificate by vehicle ownership token
     */
    function getVehiclePUC(uint256 ownTid) external view returns (PUC memory) {
        uint256 certId = ownToPUC[ownTid];
        if (certId == 0) revert CertNotFound();
        return pucs[certId];
    }

    /**
     * @dev Get PUC center details
     */
    function getCenter(uint64 centerId) external view returns (Center memory) {
        return centers[centerId];
    }

    /**
     * @dev Get emission readings from certificate
     */
    function getEmissions(uint64 certId) external view returns (
        uint16 co,
        uint16 hc,
        uint16 smoke,
        bool   passed
    ) {
        PUC memory puc = pucs[certId];
        return (puc.co, puc.hc, puc.smoke, puc.passed);
    }

    function supportsInterface(bytes4 interfaceId)
        public view override(AccessControl) returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}