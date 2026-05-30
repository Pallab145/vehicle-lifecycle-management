// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./VehicleLib.sol";
import "./IVehicleContracts.sol";

/**
 * @title DigitalVehiclePassport
 * @dev Soulbound NFT representing the permanent, immutable identity of a vehicle.
 *      The DVP is minted to the manufacturer and INTENTIONALLY never burned, even on scrap.
 *      It acts as an on-chain audit trail for the entire vehicle lifecycle (birth → death).
 *
 * ROLES:
 * - ADMIN_ROLE:  System admin — manages manufacturers and scrap centers
 * - MFG_ROLE:    Active manufacturer wallets — can mint new DVPs
 * - SCRAP_ROLE:  Active scrap center wallets — can scrap vehicles
 */
contract DigitalVehiclePassport is ERC721, AccessControl {
    using VehicleLib for address;
    using VehicleLib for uint256;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN");
    bytes32 public constant MFG_ROLE   = keccak256("MFG");
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
    error ZeroHashNotAllowed();
    error ActiveLoanExists();
    error PendingChallansExist();
    error TransferPending();
    error ScrapNotAuthorized();
    error OwnershipContractAlreadySet();
    error OwnershipContractNotSet();
    error VehicleNotRegistered();
    error NotVehicleOwner();
    error NotAManufacturer();

    struct Entity {
        uint64  id;
        address auth;
        bool    active;
    }

    struct Passport {
        uint64  tokenId;
        uint64  mfgId;
        uint64  scrapId;
        uint32  mfgDate;
        uint32  scrapDate;
        Status  status;
        bytes32 vinHash;
        bytes32 engineHash;
        bytes32 chassisHash;
        bytes32 specsHash;
    }

    uint64 private _tokenCtr;
    uint64 private _mfgCtr;
    uint64 private _scrapCtr;

    mapping(string  => uint64)     public mfgCode;
    mapping(uint64  => Entity)     public mfgs;
    mapping(address => uint64)     public addrToMfg;

    mapping(string  => uint64)     public scrapCode;
    mapping(uint64  => Entity)     public scraps;
    mapping(address => uint64)     public addrToScrap;

    mapping(uint256 => Passport)   public passports;
    mapping(bytes32 => uint256)    public vinToToken;
    mapping(uint64  => uint256[])  public mfgVehicles;
    mapping(uint64  => uint256[])  public scrapVehicles;
    mapping(uint256 => address)    public vehicleDealer;

    /// @dev Pre-authorization: vehicle owner must designate a specific scrap center
    ///      before that center can call scrapVehicle on their vehicle.
    mapping(uint256 => uint64) public authorizedScrapCenter;

    /// @dev Cross-contract references for compliance checks
    IOwnershipToken  public ownershipContract;
    ILoanContract    public loanContract;
    IChallanContract public challanContract;
    IInsuranceToken  public insContract;
    IPUCToken        public pucContract;

    event MfgReg(uint64 indexed id, string code, address auth);
    event MfgToggled(uint64 indexed id, bool active);
    event ScrapReg(uint64 indexed id, string code, address auth);
    event ScrapToggled(uint64 indexed id, bool active);
    event VehicleMfg(uint256 indexed tokenId, bytes32 indexed vinHash, uint64 indexed mfgId);
    event StatusChange(uint256 indexed tokenId, Status oldStatus, Status newStatus);
    event VehicleScrapped(uint256 indexed tokenId, uint64 indexed scrapId, uint32 scrapDate);
    event VehicleAssignedToDealer(uint256 indexed tokenId, uint64 indexed mfgId, address indexed dealer, uint32 assignedDate);
    event ScrapAuthorized(uint256 indexed tokenId, uint64 indexed scrapId, address indexed owner);
    event OwnershipContractLinked(address ownershipContract);
    event ComplianceContractsLinked(address loan, address challan, address ins, address puc);

    constructor() ERC721("DigitalVehiclePassport", "DVP") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    // ========================================================================
    // ADMIN — CONTRACT LINKING
    // ========================================================================

    /**
     * @dev Link OwnershipToken — one-time setter to prevent accidental overwrites.
     */
    function setOwnershipContract(address _ownContract) external onlyRole(ADMIN_ROLE) {
        if (address(ownershipContract) != address(0)) revert OwnershipContractAlreadySet();
        _ownContract.validateAddress();
        ownershipContract = IOwnershipToken(_ownContract);
        emit OwnershipContractLinked(_ownContract);
    }

    /**
     * @dev Link compliance contracts needed for scrap validation.
     *      Must be called after all contracts are deployed.
     */
    function setComplianceContracts(
        address _loan,
        address _challan,
        address _ins,
        address _puc
    ) external onlyRole(ADMIN_ROLE) {
        _loan.validateAddress();
        _challan.validateAddress();
        _ins.validateAddress();
        _puc.validateAddress();

        loanContract    = ILoanContract(_loan);
        challanContract = IChallanContract(_challan);
        insContract     = IInsuranceToken(_ins);
        pucContract     = IPUCToken(_puc);

        emit ComplianceContractsLinked(_loan, _challan, _ins, _puc);
    }

    // ========================================================================
    // MANUFACTURER MANAGEMENT
    // ========================================================================

    function regMfg(string calldata code, address auth) external onlyRole(ADMIN_ROLE) {
        if (mfgCode[code] != 0) revert EntityExists();
        if (addrToMfg[auth] != 0) revert EntityExists();
        auth.validateAddress();

        _mfgCtr++;
        mfgs[_mfgCtr]    = Entity(_mfgCtr, auth, true);
        mfgCode[code]    = _mfgCtr;
        addrToMfg[auth]  = _mfgCtr;
        _grantRole(MFG_ROLE, auth);

        emit MfgReg(_mfgCtr, code, auth);
    }

    /**
     * @dev Toggle manufacturer active status.
     *      Deactivating ONLY blocks new `manufacture()` calls (via MFG_ROLE revoke).
     *      `assignToDealer()` uses entity ID ownership — NOT MFG_ROLE — so existing
     *      manufactured vehicles can still be assigned even after deactivation.
     */
    function toggleMfg(string calldata code) external onlyRole(ADMIN_ROLE) {
        uint64 id = mfgCode[code];
        if (id == 0) revert EntityNotFound();

        bool newState = !mfgs[id].active;
        mfgs[id].active = newState;

        // MFG_ROLE controls manufacture() — revoke on deactivation
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
        if (addrToScrap[auth] != 0) revert EntityExists();
        auth.validateAddress();

        _scrapCtr++;
        scraps[_scrapCtr]  = Entity(_scrapCtr, auth, true);
        scrapCode[code]    = _scrapCtr;
        addrToScrap[auth]  = _scrapCtr;
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

    /**
     * @dev Mint a new Digital Vehicle Passport for a manufactured vehicle.
     *      All hash fields must be non-zero — prevents ghost vehicles with null identities.
     */
    function manufacture(
        bytes32 vinHash,
        bytes32 specsHash,
        bytes32 engineHash,
        bytes32 chassisHash
    ) external onlyRole(MFG_ROLE) returns (uint256) {
        // Zero-hash guard — prevents ghost vehicles with null identities
        if (vinHash     == bytes32(0)) revert ZeroHashNotAllowed();
        if (engineHash  == bytes32(0)) revert ZeroHashNotAllowed();
        if (chassisHash == bytes32(0)) revert ZeroHashNotAllowed();
        if (specsHash   == bytes32(0)) revert ZeroHashNotAllowed();

        if (vinToToken[vinHash] != 0) revert VehicleExists();

        uint64 mfgId = addrToMfg[msg.sender];
        if (!mfgs[mfgId].active) revert EntityNotActive();

        _tokenCtr++;
        uint256 tokenId = _tokenCtr;

        passports[tokenId] = Passport({
            tokenId:     uint64(tokenId),
            mfgId:       mfgId,
            scrapId:     0,
            mfgDate:     uint32(block.timestamp),
            scrapDate:   0,
            status:      Status.NOT_REG,
            vinHash:     vinHash,
            engineHash:  engineHash,
            chassisHash: chassisHash,
            specsHash:   specsHash
        });

        vinToToken[vinHash] = tokenId;
        mfgVehicles[mfgId].push(tokenId);
        _safeMint(msg.sender, tokenId);

        emit VehicleMfg(tokenId, vinHash, mfgId);
        return tokenId;
    }

    /**
     * @dev Called by OwnershipToken.register() to mark the DVP as ACTIVE.
     *      Only callable by the linked OwnershipToken contract.
     */
    function activateVehicle(uint256 tokenId) external {
        if (passports[tokenId].tokenId == 0) revert VehicleNotFound();
        if (passports[tokenId].status == Status.SCRAPPED) revert AlreadyScrapped();
        if (msg.sender != address(ownershipContract)) revert OnlyContractsAllowed();

        if (passports[tokenId].status == Status.NOT_REG) {
            Status old = passports[tokenId].status;
            passports[tokenId].status = Status.ACTIVE;
            emit StatusChange(tokenId, old, Status.ACTIVE);
        }
    }

    /**
     * @dev Vehicle owner pre-authorizes a specific scrap center to scrap their vehicle.
     *      This must be called BEFORE the scrap center calls scrapVehicle().
     *      Prevents any rogue registered scrap center from scrapping any vehicle.
     */
    function authorizeScrap(uint256 tokenId, string calldata scrapCenterCode) external {
        if (address(ownershipContract) == address(0)) revert OwnershipContractNotSet();
        if (passports[tokenId].status != Status.ACTIVE) revert NotActive();

        // Verify caller is the actual vehicle owner via OwnershipToken
        (bool isReg, , , address vehicleOwner) = ownershipContract.getVehicleLoanContext(tokenId);
        if (!isReg) revert VehicleNotRegistered();
        if (msg.sender != vehicleOwner) revert NotVehicleOwner();

        uint64 scrapId = scrapCode[scrapCenterCode];
        if (scrapId == 0) revert EntityNotFound();
        if (!scraps[scrapId].active) revert EntityNotActive();

        authorizedScrapCenter[tokenId] = scrapId;
        emit ScrapAuthorized(tokenId, scrapId, msg.sender);
    }

    /**
     * @dev Scrap the vehicle. Full compliance checks enforced before scrapping.
     *      Atomically deactivates ownership, terminates insurance and PUC records,
     *      and cancels all pending challans in a single transaction.
     *
     *      The DVP NFT itself is NOT burned — it remains as a permanent on-chain
     *      audit record of the vehicle's full lifecycle (birth → death).
     *
     * Requirements:
     *  1. Scrap center must have been authorized by the vehicle owner
     *  2. No active bank loan
     *  3. No pending unpaid challans
     *  4. No pending ownership transfer
     */
    function scrapVehicle(uint256 tokenId) external onlyRole(SCRAP_ROLE) {
        if (passports[tokenId].tokenId == 0) revert VehicleNotFound();
        if (passports[tokenId].status != Status.ACTIVE) revert NotActive();

        uint64 scrapId = addrToScrap[msg.sender];
        if (scraps[scrapId].id == 0)  revert EntityNotFound();
        if (!scraps[scrapId].active)  revert EntityNotActive();

        // ── Pre-Authorization Check ──────────────────────────────────────────
        // Scrap center must have been explicitly authorized by the vehicle owner
        if (authorizedScrapCenter[tokenId] != scrapId) revert ScrapNotAuthorized();

        // ── Compliance Checks ────────────────────────────────────────────────
        if (address(ownershipContract) != address(0)) {
            (, uint256 ownTid, bool hasXfer, ) = ownershipContract.getVehicleLoanContext(tokenId);

            if (ownTid != 0) {
                // Cannot scrap a vehicle with an active bank loan
                if (address(loanContract) != address(0)) {
                    if (!loanContract.isLoanCleared(tokenId)) revert ActiveLoanExists();
                }

                // Cannot scrap a vehicle with unpaid challans
                if (address(challanContract) != address(0)) {
                    if (challanContract.hasPendingChallans(ownTid)) revert PendingChallansExist();
                }

                // Cannot scrap a vehicle mid-transfer
                if (hasXfer) revert TransferPending();

                // ── Atomic Cleanup ───────────────────────────────────────────
                // Burn the ownership NFT and cancel any pending transfers atomically
                ownershipContract.deactivateVehicle(ownTid);

                // Terminate insurance policy — vehicle no longer exists
                if (address(insContract) != address(0)) {
                    insContract.terminatePolicy(ownTid);
                }

                // Terminate PUC certificate — vehicle no longer exists
                if (address(pucContract) != address(0)) {
                    pucContract.terminatePUC(ownTid);
                }

                // Cancel all orphaned pending challans
                if (address(challanContract) != address(0)) {
                    challanContract.cancelAllPendingChallans(ownTid);
                }
            }
        }

        // ── Mark as Scrapped ─────────────────────────────────────────────────
        Status old = passports[tokenId].status;
        passports[tokenId].status    = Status.SCRAPPED;
        passports[tokenId].scrapId   = scrapId;
        passports[tokenId].scrapDate = uint32(block.timestamp);

        scrapVehicles[scrapId].push(tokenId);

        // Clear the scrap authorization
        delete authorizedScrapCenter[tokenId];

        emit VehicleScrapped(tokenId, scrapId, uint32(block.timestamp));
        emit StatusChange(tokenId, old, Status.SCRAPPED);
    }

    /**
     * @dev Assign a manufactured vehicle to a dealer for retail sale.
     *      Uses entity ID ownership check — NOT MFG_ROLE — so this works even
     *      after a manufacturer is deactivated (existing vehicles aren't stranded).
     */
    function assignToDealer(uint256 tokenId, address dealer) external {
        if (passports[tokenId].tokenId == 0) revert VehicleNotFound();
        if (passports[tokenId].status != Status.NOT_REG) revert NotEligible();
        dealer.validateAddress();

        // Check entity ownership by ID, not by role (allows deactivated mfg to process existing vehicles)
        uint64 mfgId = addrToMfg[msg.sender];
        if (mfgId == 0) revert NotAManufacturer();
        if (passports[tokenId].mfgId != mfgId) revert NotYourVehicle();

        vehicleDealer[tokenId] = dealer;

        emit VehicleAssignedToDealer(tokenId, mfgId, dealer, uint32(block.timestamp));
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

    function existsAndGetStatus(uint256 tokenId) external view returns (bool, uint8) {
        return (passports[tokenId].tokenId != 0, uint8(passports[tokenId].status));
    }

    function getRegistrationContext(uint256 tokenId) external view returns (bool exists_, uint8 status, address dealer) {
        exists_ = passports[tokenId].tokenId != 0;
        status = uint8(passports[tokenId].status);
        dealer = vehicleDealer[tokenId];
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
        bool    isScrapped,
        uint64  scrapCenterId,
        uint32  scrapDate
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
    // SOULBOUND — NO TRANSFERS
    // DVP is intentionally kept forever as a permanent audit record.
    // ========================================================================

    function _update(address to, uint256 tokenId, address auth)
        internal virtual override returns (address)
    {
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