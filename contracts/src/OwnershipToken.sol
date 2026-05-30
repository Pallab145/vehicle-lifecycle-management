// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./IVehicleContracts.sol";
import "./VehicleLib.sol";

/**
 * @title OwnershipToken
 * @dev Transferable NFT representing legal vehicle ownership.
 *      The ownTid is PERMANENT for the vehicle's entire lifetime.
 *      The NFT is transferred on each ownership change — the ID never changes.
 *
 * ROLES:
 * - ADMIN_ROLE:  Manage RTOs and system configuration
 * - RTO_ROLE:    Register vehicles and approve transfers
 * - SYSTEM_ROLE: Called by DVP to deactivate vehicle on scrap (cross-contract)
 */
contract OwnershipToken is ERC721, AccessControl {
    using VehicleLib for address;
    using VehicleLib for uint256;

    bytes32 public constant ADMIN_ROLE  = keccak256("ADMIN");
    bytes32 public constant RTO_ROLE    = keccak256("RTO");
    bytes32 public constant SYSTEM_ROLE = keccak256("SYSTEM");

    error OwnExists();
    error OwnNotFound();
    error NotActive();
    error RTOExists();
    error EntityExists();
    error RTONotActive();
    error RTONotFound();
    error InvalidBuyer();
    error BuyerMustBeEOA();
    error NotOwner();
    error NotBuyer();
    error XferNotFound();
    error AlreadyDone();
    error NotApproved();
    error DirectXferBlocked();
    error TransferAlreadyPending();
    error TransferExpired();
    error DealerMismatch();
    error InvalidTradeCert();
    error TradeCertTooLong();
    error InvalidInsurance();
    error InvalidPUC();
    error ActiveLoanExists();
    error PendingChallansExist();
    error TradeCertAlreadyActive();
    error FutureTimestampRequired();
    error Unauthorized();
    error ContractsNotConfigured();
    error LoanAlreadyAttached();
    error LoanBorrowerMismatch();
    error LoanNotFound();

    struct RTO {
        uint64  id;
        address auth;
        bool    active;
    }

    struct Own {
        uint64  ownTid;
        uint64  rtoId;
        uint256 dvpId;
        uint32  regDate;
        uint32  xferCnt;
        bool    active;
        address owner;
    }

    struct Xfer {
        uint64  reqId;
        uint64  ownTid;
        uint64  rtoId;
        address seller;
        address buyer;
        uint32  reqDate;
        bool    sellerOK;
        bool    buyerOK;
        bool    rtoOK;
        bool    done;
        bool    hasPendingLoan;
        uint64  pendingBankId;
        uint16  pendingTenure;
        uint128 pendingAmount;
    }

    struct TradeCert {
        uint64 rtoId;
        uint32 issuedOn;
        uint32 validTill;
        bool   active;
    }

    IDigitalVehiclePassport public dvpContract;
    IInsuranceToken          public insContract;
    IPUCToken                public pucContract;
    ILoanContract            public loanContract;
    IChallanContract         public challanContract;

    uint64 private _tokenCtr;
    uint64 private _xferCtr;
    uint64 private _rtoCtr;

    mapping(string  => uint64)     public rtoCode;
    mapping(uint64  => RTO)        public rtos;
    mapping(address => uint64)     public addrToRTO;
    mapping(uint256 => Own)        public owns;
    mapping(uint256 => uint256)    public dvpToOwn;
    mapping(uint256 => Xfer)       private activeXfer;
    mapping(uint256 => bool)       public hasActiveXfer;
    mapping(address => TradeCert)  public tradeCerts;

    event RTOReg(uint64 indexed id, string code, address auth);
    event RTOStatusToggled(uint64 indexed id, bool active);
    event VehicleReg(uint256 indexed ownTid, address indexed owner, uint64 indexed rtoId, uint256 dvpId);
    event VehicleDeactivated(uint256 indexed ownTid);
    event XferInit(uint64 indexed reqId, uint256 indexed ownTid, address seller, address buyer);
    event XferCancelled(uint64 indexed reqId, uint256 indexed ownTid);
    event XferApproved(uint64 indexed reqId, uint8 approver);
    event XferDone(uint64 indexed reqId, uint256 indexed ownTid, address indexed newOwner);
    event TradeCertIssued(address indexed dealer, uint64 indexed rtoId, uint32 validTill);
    event TradeCertRevoked(address indexed dealer, uint64 indexed rtoId);
    event ContractsUpdated(address ins, address puc, address loan, address challan);

    constructor(address _dvp) ERC721("VehicleOwnership", "OWN") {
        _dvp.validateAddress();
        dvpContract = IDigitalVehiclePassport(_dvp);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    // ========================================================================
    // MODIFIER — Blocks approveTransfer until all compliance contracts linked
    // ========================================================================

    /**
     * @dev Guards approveTransfer. Ensures ALL 4 compliance contracts are set
     *      before any vehicle transfer can be approved. Eliminates the silent
     *      bypass that existed during the deployment window.
     */
    modifier contractsConfigured() {
        if (
            address(insContract)    == address(0) ||
            address(pucContract)    == address(0) ||
            address(loanContract)   == address(0) ||
            address(challanContract) == address(0)
        ) revert ContractsNotConfigured();
        _;
    }

    // ========================================================================
    // ADMIN — CONTRACT LINKING
    // ========================================================================

    /**
     * @dev Link all 4 compliance contracts. Emits ContractsUpdated for audit trail.
     *      All 4 addresses must be non-zero to prevent partial configuration.
     */
    function setContracts(
        address _ins,
        address _puc,
        address _loan,
        address _challan
    ) external onlyRole(ADMIN_ROLE) {
        _ins.validateAddress();
        _puc.validateAddress();
        _loan.validateAddress();
        _challan.validateAddress();

        insContract     = IInsuranceToken(_ins);
        pucContract     = IPUCToken(_puc);
        loanContract    = ILoanContract(_loan);
        challanContract = IChallanContract(_challan);

        emit ContractsUpdated(_ins, _puc, _loan, _challan);
    }

    // ========================================================================
    // RTO MANAGEMENT
    // ========================================================================

    function regRTO(string calldata code, address auth) external onlyRole(ADMIN_ROLE) {
        if (rtoCode[code] != 0) revert RTOExists();
        if (addrToRTO[auth] != 0) revert EntityExists();
        auth.validateAddress();

        _rtoCtr++;
        rtos[_rtoCtr]    = RTO(_rtoCtr, auth, true);
        rtoCode[code]    = _rtoCtr;
        addrToRTO[auth]  = _rtoCtr;
        _grantRole(RTO_ROLE, auth);

        emit RTOReg(_rtoCtr, code, auth);
    }

    function toggleRTOStatus(string calldata code) external onlyRole(ADMIN_ROLE) {
        uint64 rtoId = rtoCode[code];
        if (rtoId == 0) revert RTONotFound();

        bool newState = !rtos[rtoId].active;
        rtos[rtoId].active = newState;
        
        if (newState) {
            _grantRole(RTO_ROLE, rtos[rtoId].auth);
        } else {
            _revokeRole(RTO_ROLE, rtos[rtoId].auth);
        }

        emit RTOStatusToggled(rtoId, newState);
    }

    // Add this view function for checking RTO status
    function isRTOActive(string calldata code) external view returns (bool) {
        uint64 rtoId = rtoCode[code];
        if (rtoId == 0) return false;
        return rtos[rtoId].active;
    }

    // ========================================================================
    // VEHICLE REGISTRATION
    // ========================================================================

    /**
     * @dev Register a vehicle for the first time (first sale from dealer to owner).
     *      The minted ownTid is the permanent ID for this vehicle's entire lifecycle.
     */
    function register(uint256 dvpId, address owner, address dealer)
        external onlyRole(RTO_ROLE) returns (uint256)
    {
        owner.validateAddress();
        dealer.validateAddress();

        if (dvpToOwn[dvpId] != 0) revert OwnExists();

        uint64 rtoId = addrToRTO[msg.sender];
        if (!rtos[rtoId].active) revert RTONotActive();

        if (!_isTradeCertValid(dealer)) revert InvalidTradeCert();

        (bool isDvpExists, , address assignedDealer) = dvpContract.getRegistrationContext(dvpId);
        if (!isDvpExists) revert OwnNotFound();
        if (assignedDealer != dealer) revert DealerMismatch();

        if (address(loanContract) != address(0)) {
            (bool hasLoan, address borrower) = loanContract.getActiveLoanBorrower(dvpId);
            if (hasLoan && borrower != owner) revert LoanBorrowerMismatch();
        }

        _tokenCtr++;
        uint256 ownTid = _tokenCtr;

        Own storage o = owns[ownTid];
        o.ownTid = uint64(ownTid);
        o.rtoId = rtoId;
        o.dvpId = dvpId;
        o.regDate = uint32(block.timestamp);
        o.active = true;
        o.owner = owner;
        dvpToOwn[dvpId] = ownTid;
        _safeMint(owner, ownTid);

        // Activate DVP
        dvpContract.activateVehicle(dvpId);

        emit VehicleReg(ownTid, owner, rtoId, dvpId);
        return ownTid;
    }

    // ========================================================================
    // SCRAP — Called by DVP contract via SYSTEM_ROLE
    // ========================================================================

    /**
     * @dev Atomically deactivates the vehicle ownership record and burns the NFT.
     *      Called by DigitalVehiclePassport.scrapVehicle() after compliance checks pass.
     *      Also cancels any pending transfer to prevent state inconsistency.
     */
    function deactivateVehicle(uint256 ownTid) external onlyRole(SYSTEM_ROLE) {
        if (owns[ownTid].ownTid == 0) revert OwnNotFound();

        // Cancel any pending transfer first
        if (hasActiveXfer[ownTid]) {
            uint64 reqId = activeXfer[ownTid].reqId;
            delete activeXfer[ownTid];
            delete hasActiveXfer[ownTid];
            emit XferCancelled(reqId, ownTid);
        }

        owns[ownTid].active = false;
        _burn(ownTid);

        emit VehicleDeactivated(ownTid);
    }

    // ========================================================================
    // TRANSFER FLOW
    // ========================================================================

    /**
     * @dev Seller initiates a transfer request to a specific buyer.
     *      Buyer must be an EOA (not a contract) to prevent reentrancy via onERC721Received.
     */
    function initTransfer(uint256 ownTid, address buyer) external returns (uint64) {
        if (ownerOf(ownTid) != msg.sender) revert NotOwner();
        if (!owns[ownTid].active)          revert NotActive();
        if (buyer == address(0) || buyer == msg.sender) revert InvalidBuyer();

        // Block smart contracts as buyers — prevents reentrancy via onERC721Received
        if (buyer.code.length != 0) revert BuyerMustBeEOA();

        if (hasActiveXfer[ownTid]) revert TransferAlreadyPending();

        _xferCtr++;

        Xfer storage req = activeXfer[ownTid];
        req.reqId    = _xferCtr;
        req.ownTid   = uint64(ownTid);
        req.seller   = msg.sender;
        req.buyer    = buyer;
        req.reqDate  = uint32(block.timestamp);
        req.sellerOK = true;

        hasActiveXfer[ownTid] = true;

        emit XferInit(_xferCtr, ownTid, msg.sender, buyer);
        emit XferApproved(_xferCtr, 0);
        return _xferCtr;
    }

    /**
     * @dev Buyer accepts the pending transfer request.
     */
    function acceptTransfer(uint256 ownTid) external {
        Xfer storage req = activeXfer[ownTid];
        if (req.buyer != msg.sender) revert NotBuyer();
        if (req.done)                revert AlreadyDone();
        if (!req.sellerOK)           revert NotApproved();

        req.buyerOK = true;
        emit XferApproved(req.reqId, 1);
    }

    /**
     * @dev Seller, Buyer, RTO, Admin, or anyone after 30-day expiry can cancel.
     */
    function cancelTransfer(uint256 ownTid) external {
        Xfer storage req = activeXfer[ownTid];
        if (req.reqId == 0) revert XferNotFound();
        if (req.done)       revert AlreadyDone();

        bool isSeller  = req.seller == msg.sender;
        bool isBuyer   = req.buyer  == msg.sender;
        bool isRTO     = hasRole(RTO_ROLE, msg.sender);
        bool isAdmin   = hasRole(ADMIN_ROLE, msg.sender);
        bool isExpired = block.timestamp > req.reqDate + 30 days;

        if (!isSeller && !isBuyer && !isRTO && !isAdmin && !isExpired) {
            revert Unauthorized();
        }

        uint64 reqId = req.reqId;
        delete activeXfer[ownTid];
        delete hasActiveXfer[ownTid];

        emit XferCancelled(reqId, ownTid);
    }

    /**
     * @dev RTO approves and finalizes the ownership transfer.
     *      Requires ALL compliance contracts to be configured (contractsConfigured modifier).
     *      Requires transfer request to be within 30-day window.
     *      Runs full compliance validation (insurance, PUC, loan, challans).
     */
    function approveTransfer(uint256 ownTid) external onlyRole(RTO_ROLE) contractsConfigured {
        Xfer storage req = activeXfer[ownTid];
        if (!req.sellerOK || !req.buyerOK) revert NotApproved();
        if (req.done) revert AlreadyDone();

        // Enforce 30-day expiry — stale transfers cannot be approved
        if (block.timestamp > req.reqDate + 30 days) revert TransferExpired();

        uint64 rtoId = addrToRTO[msg.sender];
        if (!rtos[rtoId].active) revert RTONotActive();

        // ── Compliance Checks ──────────────────────────────────────────────
        // Insurance and PUC are always required
        if (!insContract.isInsuranceValid(ownTid))     revert InvalidInsurance();
        if (!pucContract.isPUCValid(ownTid))            revert InvalidPUC();
        if (challanContract.hasPendingChallans(ownTid)) revert PendingChallansExist();

        // MUST NOT BE ANY ACTIVE LOAN (Seller's bank must clear it first)
        uint256 dvpId = owns[ownTid].dvpId;
        if (!loanContract.isLoanCleared(dvpId)) revert ActiveLoanExists();

        // ── Finalize Transfer ───────────────────────────────────────────────
        address seller = req.seller;
        address buyer  = req.buyer;
        uint64  reqId  = req.reqId;

        // Cache pending loan state before deleting the struct
        bool hasPending = req.hasPendingLoan;
        uint64 pBankId = req.pendingBankId;
        uint128 pAmount = req.pendingAmount;
        uint16 pTenure = req.pendingTenure;

        owns[ownTid].owner = buyer;
        owns[ownTid].xferCnt++;

        delete activeXfer[ownTid];
        delete hasActiveXfer[ownTid];

        _transfer(seller, buyer, ownTid);

        // ── Activate Bank B's Pending Loan (if any) ─────────────────────────
        if (hasPending) {
            loanContract.systemActivatePendingLoan(dvpId, pBankId, buyer, pAmount, pTenure);
        }

        emit XferApproved(reqId, 2);
        emit XferDone(reqId, ownTid, buyer);
    }

    /**
     * @dev Attaches a pending loan to an active transfer.
     *      Called by LoanContract when Bank B decides to fund the buyer.
     */
    function attachPendingLoan(
        uint256 dvpId,
        uint64  bankId,
        address buyer,
        uint128 amount,
        uint16  tenure
    ) external onlyRole(SYSTEM_ROLE) {
        uint256 ownTid = dvpToOwn[dvpId];
        Xfer storage req = activeXfer[ownTid];
        if (req.reqId == 0) revert XferNotFound();
        if (req.buyer != buyer) revert InvalidBuyer();
        if (req.hasPendingLoan) revert LoanAlreadyAttached();

        req.hasPendingLoan = true;
        req.pendingBankId  = bankId;
        req.pendingAmount  = amount;
        req.pendingTenure  = tenure;
    }

    /**
     * @dev Detaches a pending loan from an active transfer.
     *      Called by LoanContract if the bank cancels the loan before RTO approval.
     */
    function detachPendingLoan(uint256 dvpId, uint64 bankId) external onlyRole(SYSTEM_ROLE) {
        uint256 ownTid = dvpToOwn[dvpId];
        Xfer storage req = activeXfer[ownTid];
        if (req.reqId == 0) revert XferNotFound();
        if (!req.hasPendingLoan) revert LoanNotFound();
        if (req.pendingBankId != bankId) revert Unauthorized();

        req.hasPendingLoan = false;
        req.pendingBankId  = 0;
        req.pendingAmount  = 0;
        req.pendingTenure  = 0;
    }

    // ========================================================================
    // TRADE CERTIFICATES
    // ========================================================================

    /**
     * @dev Issue trade certificate to a dealer. Capped at 365 days max.
     */
    function issueTradeCert(address dealer, uint32 validTill) external onlyRole(RTO_ROLE) {
        dealer.validateAddress();
        if (validTill <= uint32(block.timestamp)) revert FutureTimestampRequired();

        // Cap at 365 days to prevent century-long certificates
        if (validTill > uint32(block.timestamp) + 365 days) revert TradeCertTooLong();

        uint64 rtoId = addrToRTO[msg.sender];
        if (!rtos[rtoId].active) revert RTONotActive();

        TradeCert storage tc = tradeCerts[dealer];
        if (tc.active && block.timestamp <= tc.validTill) revert TradeCertAlreadyActive();

        tradeCerts[dealer] = TradeCert({
            rtoId:     rtoId,
            issuedOn:  uint32(block.timestamp),
            validTill: validTill,
            active:    true
        });

        emit TradeCertIssued(dealer, rtoId, validTill);
    }

    function revokeTradeCert(address dealer) external onlyRole(RTO_ROLE) {
        TradeCert storage tc = tradeCerts[dealer];
        if (!tc.active) revert NotActive();

        tc.active = false;
        emit TradeCertRevoked(dealer, tc.rtoId);
    }

    function _isTradeCertValid(address dealer) internal view returns (bool) {
        TradeCert memory tc = tradeCerts[dealer];
        return tc.active && block.timestamp <= tc.validTill;
    }

    // ========================================================================
    // VIEW FUNCTIONS
    // ========================================================================

    function exists(uint256 ownTid) public view returns (bool) {
        return owns[ownTid].ownTid != 0;
    }

    function isActive(uint256 ownTid) external view returns (bool) {
        return owns[ownTid].active;
    }

    function existsAndIsActive(uint256 ownTid) external view returns (bool exists_, bool active_) {
        exists_ = (owns[ownTid].ownTid != 0);
        active_ = owns[ownTid].active;
    }

    function isRegistered(uint256 dvpId) external view returns (bool) {
        return dvpToOwn[dvpId] != 0;
    }

    function currentOwner(uint256 ownTid) external view returns (address) {
        return owns[ownTid].owner;
    }

    function getActiveXfer(uint256 ownTid) external view returns (Xfer memory) {
        return activeXfer[ownTid];
    }

    function getVehicleLoanContext(uint256 dvpId) external view returns (
        bool isReg,
        uint256 ownTid,
        bool hasXfer,
        address owner
    ) {
        ownTid = dvpToOwn[dvpId];
        if (ownTid != 0) {
            isReg = true;
            hasXfer = hasActiveXfer[ownTid];
            owner = owns[ownTid].owner;
        }
    }

    function dvpTokenId(uint256 ownTid) external view returns (uint256) {
        return owns[ownTid].dvpId;
    }

    function isRTORegistered(address auth) external view returns (bool) {
        return addrToRTO[auth] != 0;
    }

    // ========================================================================
    // BLOCK DIRECT TRANSFERS
    // ========================================================================

    /**
     * @dev Override _update to enforce transfer control:
     *      - Minting (from == address(0)): allowed
     *      - Burning  (to   == address(0)): allowed (called by deactivateVehicle)
     *      - Internal transfer via _transfer (auth == address(0)): allowed
     *      - All other direct external transfers: BLOCKED
     */
    function _update(address to, uint256 tokenId, address auth)
        internal virtual override returns (address)
    {
        address from = _ownerOf(tokenId);

        // Allow minting and burning
        if (from == address(0) || to == address(0)) {
            return super._update(to, tokenId, auth);
        }

        // Allow internal transfers (called from approveTransfer via _transfer)
        if (auth == address(0)) {
            return super._update(to, tokenId, auth);
        }

        // Block all direct external transfers
        revert DirectXferBlocked();
    }

    function supportsInterface(bytes4 interfaceId)
        public view override(ERC721, AccessControl) returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}