// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./VehicleLib.sol";

/**
 * @title InsuranceToken
 * @dev NFT representing active insurance policy
 * 
 * ROLES:
 * - ADMIN_ROLE: Manage insurance companies
 * - INS_ROLE: Issue and manage policies
 */
contract InsuranceToken is ERC721, AccessControl {
    using VehicleLib for address;
    using VehicleLib for uint256;
    
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN");
    bytes32 public constant INS_ROLE = keccak256("INS");
    
    error InsExists();
    error InsNotActive();
    error InsNotFound();
    error NotExpired();
    error PolicyNotFound();
    error PolicyExists();
    
    struct Ins {
        uint64 id;
        address auth;
        bool active;
    }
    
    struct Policy {
        uint64 polId;
        uint64 ownTid;
        uint64 compId;
        uint32 issueDate;
        uint32 expiryDate;
        uint32 claimCnt;
        bool active;
        uint128 coverage;
        uint128 premium;
    }
    
    uint64 private _polCtr;
    uint64 private _insCtr;
    
    mapping(string => uint64) public insCode;
    mapping(uint64 => Ins) public insurers;
    mapping(address => uint64) public addrToIns;
    mapping(uint256 => Policy) public policies;
    mapping(uint256 => uint256) public ownToPolicy;
    
    event InsReg(uint64 indexed id, string code, address auth);
    event InsStatusToggled(uint64 indexed id, bool active);
    event PolicyIssued(uint64 indexed polId, uint256 indexed ownTid, uint64 indexed compId, uint32 expiry);
    event PolicyExpired(uint64 indexed polId);
    event ClaimFiled(uint64 indexed polId, uint32 claimNum);
    
    constructor() ERC721("VehicleInsurance", "VINS") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }
    
    // ========================================================================
    // INSURANCE COMPANY MANAGEMENT
    // ========================================================================
    
    /**
     * @dev Register insurance company
     */
    function regIns(string calldata code, address auth) external onlyRole(ADMIN_ROLE) {
        if (insCode[code] != 0) revert InsExists();
        auth.validateAddress();
        
        _insCtr++;
        insurers[_insCtr] = Ins(_insCtr, auth, true);
        insCode[code] = _insCtr;
        addrToIns[auth] = _insCtr;
        _grantRole(INS_ROLE, auth);
        
        emit InsReg(_insCtr, code, auth);
    }
    
    /**
     * @dev Toggle insurance company status (activate ↔ deactivate)
     * Single function - flips between active and inactive
     */
    function toggleInsurerStatus(string calldata code) 
        external onlyRole(ADMIN_ROLE) {
        uint64 insId = insCode[code];
        if (insId == 0) revert InsNotFound();
        
        insurers[insId].active = !insurers[insId].active;
        
        emit InsStatusToggled(insId, insurers[insId].active);
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
     * @dev Issue insurance policy
     */
    function issuePolicy(
        uint256 ownTid,
        address owner,
        uint32 expiryDate,
        uint128 coverage,
        uint128 premium
    ) external onlyRole(INS_ROLE) returns (uint64) {
        owner.validateAddress();
        
        // Check if vehicle already has an active policy
        uint256 existingPolId = ownToPolicy[ownTid];
        if (existingPolId != 0 && policies[existingPolId].active && block.timestamp <= policies[existingPolId].expiryDate) {
            revert PolicyExists();
        }
        
        // If a previous policy exists (now expired or superseded), mark it inactive
        if (existingPolId != 0) {
            policies[existingPolId].active = false;
        }
        
        uint64 compId = addrToIns[msg.sender];
        if (!insurers[compId].active) revert InsNotActive();
        
        _polCtr++;
        uint64 polId = _polCtr;
        
        policies[polId] = Policy({
            polId: polId,
            ownTid: ownTid.toUint64(),
            compId: compId,
            issueDate: uint32(block.timestamp),
            expiryDate: expiryDate,
            claimCnt: 0,
            active: true,
            coverage: coverage,
            premium: premium
        });
        
        ownToPolicy[ownTid] = polId;
        _safeMint(owner, polId);
        
        emit PolicyIssued(polId, ownTid, compId, expiryDate);
        return polId;
    }
    
    /**
     * @dev Check if insurance is valid for a vehicle
     */
    function isInsuranceValid(uint256 ownTid) external view returns (bool) {
        uint256 polId = ownToPolicy[ownTid];
        if (polId == 0) return false;
        
        Policy memory pol = policies[polId];
        return pol.active && block.timestamp <= pol.expiryDate;
    }
    
    /**
     * @dev Mark policy as expired
     */
    function markExpired(uint64 polId) external {
        if (policies[polId].polId == 0) revert PolicyNotFound();
        if (block.timestamp <= policies[polId].expiryDate) revert NotExpired();
        
        policies[polId].active = false;
        emit PolicyExpired(polId);
    }
    
    /**
     * @dev File insurance claim
     */
    function fileClaim(uint64 polId) external onlyRole(INS_ROLE) {
        if (policies[polId].polId == 0) revert PolicyNotFound();
        if (!policies[polId].active) revert InsNotActive();
        
        policies[polId].claimCnt++;
        emit ClaimFiled(polId, policies[polId].claimCnt);
    }
    
    // ========================================================================
    // VIEW FUNCTIONS
    // ========================================================================
    
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
    
    // ========================================================================
    // TRANSFER RESTRICTIONS
    // ========================================================================
    
    /**
     * @dev Override _update to prevent transfers
     * Policies are bound to the vehicle owner
     */
    function _update(address to, uint256 tokenId, address auth) 
        internal virtual override returns (address) {
        address from = _ownerOf(tokenId);
        
        // Allow minting (from == address(0))
        // Block all transfers
        if (from != address(0)) {
            revert("Insurance policies are non-transferable");
        }
        
        return super._update(to, tokenId, auth);
    }
    
    function supportsInterface(bytes4 interfaceId)
        public view override(ERC721, AccessControl) returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}