// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./VehicleLib.sol";
import "./IVehicleContracts.sol";

/**
 * @title InsuranceToken
 * @dev On-chain insurance policy registry. Vehicle-bound (keyed by ownTid).
 *
 * ROLES:
 * - ADMIN_ROLE:  Manage insurance companies
 * - INS_ROLE:    Issue and manage policies (insurance company wallets)
 * - SYSTEM_ROLE: Called by DVP during scrapVehicle to terminate policies
 */
contract InsuranceToken is AccessControl {
    using VehicleLib for address;
    using VehicleLib for uint256;

    bytes32 public constant ADMIN_ROLE  = keccak256("ADMIN");
    bytes32 public constant INS_ROLE    = keccak256("INS");
    bytes32 public constant SYSTEM_ROLE = keccak256("SYSTEM");

    /// @dev Maximum insurance term — 3 years per policy
    uint32 public constant MAX_POLICY_DURATION = 3 * 365 days;
    /// @dev Maximum claims per policy before it must be renewed
    uint32 public constant MAX_CLAIMS = 50;

    error InsExists();
    error EntityExists();
    error InsNotActive();
    error InsNotFound();
    error NotExpired();
    error PolicyNotFound();
    error PolicyNotActive();
    error PolicyExists();
    error Unauthorized();
    error VehicleNotFound();
    error VehicleNotActive();
    error OwnershipContractNotSet();
    error ExpiryInPast();
    error ExpiryTooFar();
    error ClaimLimitReached();
    error OwnershipContractAlreadySet();

    struct Ins {
        uint64  id;
        address auth;
        bool    active;
    }

    struct Policy {
        uint64  polId;
        uint64  ownTid;
        uint64  compId;
        uint32  issueDate;
        uint32  expiryDate;
        uint32  claimCnt;
        bool    active;
        uint128 coverage;
        uint128 premium;
    }

    uint64 private _polCtr;
    uint64 private _insCtr;

    IOwnershipToken public ownershipContract;

    mapping(string  => uint64)   public insCode;
    mapping(uint64  => Ins)      public insurers;
    mapping(address => uint64)   public addrToIns;
    mapping(uint256 => Policy)   public policies;
    mapping(uint256 => uint256)  public ownToPolicy;

    event InsReg(uint64 indexed id, string code, address auth);
    event InsStatusToggled(uint64 indexed id, bool active);
    event PolicyIssued(uint64 indexed polId, uint256 indexed ownTid, uint64 indexed compId, uint32 expiry);
    event PolicyExpired(uint64 indexed polId);
    event PolicyTerminated(uint64 indexed polId, uint256 indexed ownTid);
    event ClaimFiled(uint64 indexed polId, uint32 claimNum);
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
    // INSURANCE COMPANY MANAGEMENT
    // ========================================================================

    /**
     * @dev Register insurance company
     */
    function regIns(string calldata code, address auth) external onlyRole(ADMIN_ROLE) {
        if (insCode[code] != 0) revert InsExists();
        if (addrToIns[auth] != 0) revert EntityExists();
        auth.validateAddress();

        _insCtr++;
        insurers[_insCtr] = Ins(_insCtr, auth, true);
        insCode[code]     = _insCtr;
        addrToIns[auth]   = _insCtr;
        _grantRole(INS_ROLE, auth);

        emit InsReg(_insCtr, code, auth);
    }

    function toggleInsurerStatus(string calldata code) external onlyRole(ADMIN_ROLE) {
        uint64 insId = insCode[code];
        if (insId == 0) revert InsNotFound();

        bool newState = !insurers[insId].active;
        insurers[insId].active = newState;
        
        if (newState) {
            _grantRole(INS_ROLE, insurers[insId].auth);
        } else {
            _revokeRole(INS_ROLE, insurers[insId].auth);
        }
        
        emit InsStatusToggled(insId, newState);
    }

    /**
     * @dev Check if insurer is active
     */
    function isInsurerActive(string calldata code) external view returns (bool) {
        uint64 insId = insCode[code];
        if (insId == 0) return false;
        return insurers[insId].active;
    }

    // ========================================================================
    // POLICY MANAGEMENT
    // ========================================================================

    /**
     * @dev Issue an insurance policy for a vehicle.
     *      Validates vehicle exists and is active on-chain.
     *      Does NOT accept an `owner` parameter — the policy is vehicle-bound.
     */
    function issuePolicy(
        uint256 ownTid,
        uint32  expiryDate,
        uint128 coverage,
        uint128 premium
    ) external onlyRole(INS_ROLE) returns (uint64) {
        // Validate expiry date range
        if (expiryDate <= uint32(block.timestamp)) revert ExpiryInPast();
        if (expiryDate > uint32(block.timestamp) + MAX_POLICY_DURATION) revert ExpiryTooFar();

        // Validate vehicle exists and is active
        if (address(ownershipContract) == address(0)) revert OwnershipContractNotSet();
        
        (bool exists, bool active) = ownershipContract.existsAndIsActive(ownTid);
        if (!exists) revert VehicleNotFound();
        if (!active) revert VehicleNotActive();

        // Check if vehicle already has a valid active policy
        uint256 existingPolId = ownToPolicy[ownTid];
        if (existingPolId != 0 && policies[existingPolId].active && block.timestamp <= policies[existingPolId].expiryDate) {
            revert PolicyExists();
        }

        // Deactivate any previous expired/superseded policy
        if (existingPolId != 0) {
            policies[existingPolId].active = false;
        }

        uint64 compId = addrToIns[msg.sender];
        if (!insurers[compId].active) revert InsNotActive();

        _polCtr++;
        uint64 polId = _polCtr;

        policies[polId] = Policy({
            polId:     polId,
            ownTid:    ownTid.toUint64(),
            compId:    compId,
            issueDate: uint32(block.timestamp),
            expiryDate: expiryDate,
            claimCnt:  0,
            active:    true,
            coverage:  coverage,
            premium:   premium
        });

        ownToPolicy[ownTid] = polId;

        emit PolicyIssued(polId, ownTid, compId, expiryDate);
        return polId;
    }

    /**
     * @dev Mark an expired policy as inactive. Restricted to INS_ROLE.
     */
    function markExpired(uint64 polId) external onlyRole(INS_ROLE) {
        if (policies[polId].polId == 0) revert PolicyNotFound();
        if (block.timestamp <= policies[polId].expiryDate) revert NotExpired();

        policies[polId].active = false;
        emit PolicyExpired(polId);
    }

    /**
     * @dev File a claim on a policy.
     *      Only the SAME insurance company that ISSUED the policy can file claims.
     *      Prevents rival companies from manipulating each other's claim counts.
     */
    function fileClaim(uint64 polId) external onlyRole(INS_ROLE) {
        if (policies[polId].polId == 0) revert PolicyNotFound();
        if (!policies[polId].active) revert PolicyNotActive();
        if (block.timestamp > policies[polId].expiryDate) revert PolicyNotActive();

        // Authorization: only the issuing company can file claims
        uint64 compId = addrToIns[msg.sender];
        if (policies[polId].compId != compId) revert Unauthorized();

        // Cap claims to prevent spam
        if (policies[polId].claimCnt >= MAX_CLAIMS) revert ClaimLimitReached();

        policies[polId].claimCnt++;
        emit ClaimFiled(polId, policies[polId].claimCnt);
    }

    /**
     * @dev Terminate the active policy for a vehicle when it is scrapped.
     *      Called by DVP.scrapVehicle() via SYSTEM_ROLE.
     */
    function terminatePolicy(uint256 ownTid) external onlyRole(SYSTEM_ROLE) {
        uint256 polId = ownToPolicy[ownTid];
        if (polId != 0 && policies[polId].active) {
            policies[polId].active = false;
            emit PolicyTerminated(uint64(polId), ownTid);
        }
        // No revert if no active policy — scrap should succeed regardless
    }

    // ========================================================================
    // VIEW FUNCTIONS
    // ========================================================================

    /**
     * @dev Returns true if the vehicle has a valid, active, unexpired policy.
     */
    function isInsuranceValid(uint256 ownTid) external view returns (bool) {
        uint256 polId = ownToPolicy[ownTid];
        if (polId == 0) return false;

        Policy memory pol = policies[polId];
        return pol.active && block.timestamp <= pol.expiryDate;
    }

    function getPolicy(uint64 polId) external view returns (Policy memory) {
        if (policies[polId].polId == 0) revert PolicyNotFound();
        return policies[polId];
    }

    function getVehiclePolicy(uint256 ownTid) external view returns (Policy memory) {
        uint256 polId = ownToPolicy[ownTid];
        if (polId == 0) revert PolicyNotFound();
        return policies[polId];
    }

    function getInsurer(uint64 insId) external view returns (Ins memory) {
        return insurers[insId];
    }

    function supportsInterface(bytes4 interfaceId)
        public view override(AccessControl) returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}