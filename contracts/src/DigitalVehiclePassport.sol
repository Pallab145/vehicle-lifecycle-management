// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./VehicleLib.sol";

/**
 * @title DigitalVehiclePassport
 * @dev Soulbound NFT - Permanent vehicle identity
 * 
 * ROLES:
 * - ADMIN_ROLE: System admin
 * - MFG_ROLE: Manufacturers
 * - SCRAP_ROLE: Scrap centers
 */
contract DigitalVehiclePassport is ERC721, AccessControl {
    using VehicleLib for address;
    using VehicleLib for uint256;
    
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN");
    bytes32 public constant MFG_ROLE = keccak256("MFG");
    bytes32 public constant SCRAP_ROLE = keccak256("SCRAP");
    
    enum Status { NOT_REG, ACTIVE, SCRAPPED }
    
    error VehicleExists();
    error VehicleNotFound();
    error AlreadyScrapped();
    error NotActive();
    error EntityExists();
    error EntityNotActive();
    error EntityNotFound();
    error Soulbound();
    error NotYourVehicle();
    error OnlyContractsAllowed();
    error NotEligible();
    
    // Single struct for manufacturers, scrap centers, etc.
    struct Entity {
        uint64 id;
        address auth;
        bool active;
    }
    
    struct Passport {
        uint64 tokenId;
        uint64 mfgId;
        uint64 scrapId;
        uint32 mfgDate;
        uint32 scrapDate;
        Status status;
        bytes32 vinHash;
        bytes32 engineHash;
        bytes32 chassisHash;
        bytes32 specsHash;
    }
    
    uint64 private _tokenCtr;
    uint64 private _mfgCtr;
    uint64 private _scrapCtr;
    
    mapping(string => uint64) public mfgCode;
    mapping(uint64 => Entity) public mfgs;
    mapping(address => uint64) public addrToMfg;
    
    mapping(string => uint64) public scrapCode;
    mapping(uint64 => Entity) public scraps;
    mapping(address => uint64) public addrToScrap;
    
    mapping(uint256 => Passport) public passports;
    mapping(bytes32 => uint256) public vinToToken;
    mapping(uint64 => uint256[]) public mfgVehicles;
    mapping(uint64 => uint256[]) public scrapVehicles;
    mapping(uint256 => address) public vehicleDealer;

    address public ownershipContract;
    
    event MfgReg(uint64 indexed id, string code, address auth);
    event MfgToggled(uint64 indexed id, bool active);
    event ScrapReg(uint64 indexed id, string code, address auth);
    event ScrapToggled(uint64 indexed id, bool active);
    event VehicleMfg(uint256 indexed tokenId, bytes32 indexed vinHash, uint64 indexed mfgId);
    event StatusChange(uint256 indexed tokenId, Status oldStatus, Status newStatus);
    event VehicleScrapped(uint256 indexed tokenId, uint64 indexed scrapId, uint32 scrapDate);
    event VehicleAssignedToDealer(
        uint256 indexed tokenId,
        uint64 indexed mfgId,
        address indexed dealer,
        uint32 assignedDate
    );

    constructor() ERC721("DigitalVehiclePassport", "DVP") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }
    
    // ========================================================================
    // MANUFACTURER MANAGEMENT
    // ========================================================================
    
    function regMfg(string calldata code, address auth) external onlyRole(ADMIN_ROLE) {
        if (mfgCode[code] != 0) revert EntityExists();
        auth.validateAddress();
        
        _mfgCtr++;
        mfgs[_mfgCtr] = Entity(_mfgCtr, auth, true);
        mfgCode[code] = _mfgCtr;
        addrToMfg[auth] = _mfgCtr;
        _grantRole(MFG_ROLE, auth);
        
        emit MfgReg(_mfgCtr, code, auth);
    }
    
    function setOwnershipContract(address _ownContract) external onlyRole(ADMIN_ROLE) {
        _ownContract.validateAddress();
        ownershipContract = _ownContract;
    }
    
    function toggleMfg(string calldata code) external onlyRole(ADMIN_ROLE) {
        uint64 id = mfgCode[code];
        if (id == 0) revert EntityNotFound();
        
        bool newState = !mfgs[id].active;
        mfgs[id].active = newState;
        if (newState) {
            _grantRole(MFG_ROLE, mfgs[id].auth);
        } else {
            _revokeRole(MFG_ROLE, mfgs[id].auth);
        }
        emit MfgToggled(id, newState);
    }
    
    // ========================================================================
    // SCRAP CENTER MANAGEMENT
    // ========================================================================
    
    function regScrap(string calldata code, address auth) external onlyRole(ADMIN_ROLE) {
        if (scrapCode[code] != 0) revert EntityExists();
        auth.validateAddress();
        
        _scrapCtr++;
        scraps[_scrapCtr] = Entity(_scrapCtr, auth, true);
        scrapCode[code] = _scrapCtr;
        addrToScrap[auth] = _scrapCtr;
        _grantRole(SCRAP_ROLE, auth);
        
        emit ScrapReg(_scrapCtr, code, auth);
    }
    
    function toggleScrap(string calldata code) external onlyRole(ADMIN_ROLE) {
        uint64 id = scrapCode[code];
        if (id == 0) revert EntityNotFound();
        
        bool newState = !scraps[id].active;
        scraps[id].active = newState;
        if (newState) {
            _grantRole(SCRAP_ROLE, scraps[id].auth);
        } else {
            _revokeRole(SCRAP_ROLE, scraps[id].auth);
        }
        emit ScrapToggled(id, newState);
    }
    
    // ========================================================================
    // VEHICLE LIFECYCLE
    // ========================================================================
    
    function manufacture(bytes32 vinHash, bytes32 specsHash, bytes32 engineHash,
        bytes32 chassisHash) 
        external onlyRole(MFG_ROLE) returns (uint256) {
        if (vinToToken[vinHash] != 0) revert VehicleExists();
        
        uint64 mfgId = addrToMfg[msg.sender];
        if (!mfgs[mfgId].active) revert EntityNotActive();
        
        _tokenCtr++;
        uint256 tokenId = _tokenCtr;
        
        passports[tokenId] = Passport({
            tokenId: uint64(tokenId),
            mfgId: mfgId,
            scrapId: 0,
            mfgDate: uint32(block.timestamp),
            scrapDate: 0,
            status: Status.NOT_REG,
            vinHash: vinHash,
            engineHash: engineHash,
            chassisHash: chassisHash,
            specsHash: specsHash
        });
        
        vinToToken[vinHash] = tokenId;
        mfgVehicles[mfgId].push(tokenId);
        _safeMint(msg.sender, tokenId);
        
        emit VehicleMfg(tokenId, vinHash, mfgId);
        return tokenId;
    }
    
    function activateVehicle(uint256 tokenId) external {
        if (passports[tokenId].tokenId == 0) revert VehicleNotFound();
        if (passports[tokenId].status == Status.SCRAPPED) revert AlreadyScrapped();
        if (msg.sender != ownershipContract) revert OnlyContractsAllowed();
        
        if (passports[tokenId].status == Status.NOT_REG) {
            Status old = passports[tokenId].status;
            passports[tokenId].status = Status.ACTIVE;
            emit StatusChange(tokenId, old, Status.ACTIVE);
        }
    }
    
    function scrapVehicle(uint256 tokenId) external onlyRole(SCRAP_ROLE) {
        if (passports[tokenId].tokenId == 0) revert VehicleNotFound();
        if (passports[tokenId].status != Status.ACTIVE) revert NotActive();
        
        uint64 scrapId = addrToScrap[msg.sender];
        if (scraps[scrapId].id == 0) revert EntityNotFound();
        if (!scraps[scrapId].active) revert EntityNotActive();
        
        Status old = passports[tokenId].status;
        passports[tokenId].status = Status.SCRAPPED;
        passports[tokenId].scrapId = scrapId;
        passports[tokenId].scrapDate = uint32(block.timestamp);
        
        scrapVehicles[scrapId].push(tokenId);
        
        emit VehicleScrapped(tokenId, scrapId, uint32(block.timestamp));
        emit StatusChange(tokenId, old, Status.SCRAPPED);
    }

    function assignToDealer(
        uint256 tokenId,
        address dealer
    ) external onlyRole(MFG_ROLE) {
        if (passports[tokenId].tokenId == 0) revert VehicleNotFound();
        if (passports[tokenId].status != Status.NOT_REG) revert NotEligible();

        uint64 mfgId = addrToMfg[msg.sender];
        if (passports[tokenId].mfgId != mfgId) revert NotYourVehicle();

        vehicleDealer[tokenId] = dealer;

        emit VehicleAssignedToDealer(
            tokenId,
            mfgId,
            dealer,
            uint32(block.timestamp)
        );
    }
    
    // ========================================================================
    // VIEW FUNCTIONS
    // ========================================================================
    
    function getAssignedDealer(uint256 tokenId) external view returns (address) {
        return vehicleDealer[tokenId];
    }
    
    function exists(uint256 tokenId) public view returns (bool) {
        return passports[tokenId].tokenId != 0;
    }
    
    function getStatus(uint256 tokenId) external view returns (uint8) {
        return uint8(passports[tokenId].status);
    }
    
    function getVinHash(uint256 tokenId) external view returns (bytes32) {
        return passports[tokenId].vinHash;
    }
    
    function getPassport(uint256 tokenId) external view returns (Passport memory) {
        if (passports[tokenId].tokenId == 0) revert VehicleNotFound();
        return passports[tokenId];
    }
    
    function getMfg(uint64 id) external view returns (Entity memory) {
        return mfgs[id];
    }
    
    function getScrap(uint64 id) external view returns (Entity memory) {
        return scraps[id];
    }
    
    function getMfgVehicles(uint64 id) external view returns (uint256[] memory) {
        return mfgVehicles[id];
    }
    
    function getScrapVehicles(uint64 id) external view returns (uint256[] memory) {
        return scrapVehicles[id];
    }
    
    function getScrapInfo(uint256 tokenId) external view returns (
        bool isScrapped,
        uint64 scrapCenterId,
        uint32 scrapDate
    ) {
        Passport memory p = passports[tokenId];
        return (p.status == Status.SCRAPPED, p.scrapId, p.scrapDate);
    }
    
    function isMfgActive(string calldata code) external view returns (bool) {
        uint64 id = mfgCode[code];
        return id != 0 && mfgs[id].active;
    }
    
    function isScrapActive(string calldata code) external view returns (bool) {
        uint64 id = scrapCode[code];
        return id != 0 && scraps[id].active;
    }
    
    // ========================================================================
    // SOULBOUND - NO TRANSFERS
    // ========================================================================
    
    function _update(address to, uint256 tokenId, address auth) 
        internal virtual override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }
    
    function supportsInterface(bytes4 interfaceId)
        public view override(ERC721, AccessControl) returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}