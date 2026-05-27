// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./VehicleLib.sol";

/**
 * @title PUCToken
 * @dev Pollution Under Control certificate (data only, no NFT minting)
 * PUC is tied to the vehicle (ownTid), not the owner
 * When ownership transfers, PUC validity remains with the vehicle
 * 
 * ROLES:
 * - ADMIN_ROLE: Manage PUC centers
 * - PUC_ROLE: Issue certificates
 */
contract PUCToken is AccessControl {
    using VehicleLib for address;
    using VehicleLib for uint256;
    
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN");
    bytes32 public constant PUC_ROLE = keccak256("PUC");
    
    error CenterExists();
    error CenterNotActive();
    error CenterNotFound();
    error CertExists();
    error CertNotFound();
    error NotExpired();
    error TestFailed();
    
    struct Center {
        uint64 id;
        address auth;
        bool active;
    }
    
    struct PUC {
        uint64 certId;
        uint64 ownTid;
        uint64 centerId;
        uint32 issueDate;
        uint32 expiryDate;
        uint16 co;
        uint16 hc;
        uint16 smoke;
        bool passed;
        bool valid;
    }
    
    uint64 private _certCtr;
    uint64 private _centerCtr;
    
    mapping(string => uint64) public centerCode;
    mapping(uint64 => Center) public centers;
    mapping(address => uint64) public addrToCenter;
    mapping(uint256 => PUC) public pucs;
    mapping(uint256 => uint256) public ownToPUC;
    
    event CenterReg(uint64 indexed id, string code, address auth);
    event CenterStatusToggled(uint64 indexed id, bool active);
    event PUCIssued(uint64 indexed certId, uint256 indexed ownTid, bool passed, uint32 expiry);
    event PUCExpired(uint64 indexed certId);
    
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }
    
    // ========================================================================
    // PUC CENTER MANAGEMENT
    // ========================================================================
    
    /**
     * @dev Register PUC center
     */
    function regCenter(string calldata code, address auth) external onlyRole(ADMIN_ROLE) {
        if (centerCode[code] != 0) revert CenterExists();
        auth.validateAddress();
        
        _centerCtr++;
        centers[_centerCtr] = Center(_centerCtr, auth, true);
        centerCode[code] = _centerCtr;
        addrToCenter[auth] = _centerCtr;
        _grantRole(PUC_ROLE, auth);
        
        emit CenterReg(_centerCtr, code, auth);
    }
    
    /**
     * @dev Toggle PUC center status (activate ↔ deactivate)
     * Single function - flips between active and inactive
     */
    function toggleCenterStatus(string calldata code) 
        external onlyRole(ADMIN_ROLE) {
        uint64 centerId = centerCode[code];
        if (centerId == 0) revert CenterNotFound();
        
        centers[centerId].active = !centers[centerId].active;
        
        emit CenterStatusToggled(centerId, centers[centerId].active);
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
     * @dev Issue PUC certificate (only if test passed)
     * PUC is tied to the vehicle (ownTid), not minted as NFT
     */
    function issuePUC(
        uint256 ownTid,
        uint32 expiryDate,
        uint16 co,
        uint16 hc,
        uint16 smoke,
        bool passed
    ) external onlyRole(PUC_ROLE) returns (uint64) {
        if (!passed) revert TestFailed();
        
        // Check if vehicle already has a valid PUC
        uint256 existingCertId = ownToPUC[ownTid];
        if (existingCertId != 0 && pucs[existingCertId].valid && block.timestamp <= pucs[existingCertId].expiryDate) {
            revert CertExists();
        }
        
        // If a previous certificate exists (now expired or superseded), mark it invalid
        if (existingCertId != 0) {
            pucs[existingCertId].valid = false;
        }
        
        uint64 centerId = addrToCenter[msg.sender];
        if (!centers[centerId].active) revert CenterNotActive();
        
        _certCtr++;
        uint64 certId = _certCtr;
        
        pucs[certId] = PUC({
            certId: certId,
            ownTid: ownTid.toUint64(),
            centerId: centerId,
            issueDate: uint32(block.timestamp),
            expiryDate: expiryDate,
            co: co,
            hc: hc,
            smoke: smoke,
            passed: passed,
            valid: true
        });
        
        ownToPUC[ownTid] = certId;
        
        emit PUCIssued(certId, ownTid, passed, expiryDate);
        return certId;
    }
    
    /**
     * @dev Check if PUC is valid for a vehicle
     */
    function isPUCValid(uint256 ownTid) external view returns (bool) {
        uint256 certId = ownToPUC[ownTid];
        if (certId == 0) return false;
        
        PUC memory puc = pucs[certId];
        return puc.valid && puc.passed && block.timestamp <= puc.expiryDate;
    }
    
    /**
     * @dev Mark PUC certificate as expired
     */
    function markExpired(uint64 certId) external {
        if (pucs[certId].certId == 0) revert CertNotFound();
        if (block.timestamp <= pucs[certId].expiryDate) revert NotExpired();
        
        pucs[certId].valid = false;
        emit PUCExpired(certId);
    }
    
    // ========================================================================
    // VIEW FUNCTIONS
    // ========================================================================
    
    /**
     * @dev Get PUC certificate details
     */
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
        bool passed
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