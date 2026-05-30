// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./VehicleLib.sol";
import "./IVehicleContracts.sol";

/**
 * @title LoanContract
 * @dev Manages vehicle loans, tied to the physical DVP (Chassis).
 *
 * ROLES:
 * - ADMIN_ROLE:   Manage banks
 * - BANK_ROLE:    Register loans, issue NOCs, refinance
 * - SYSTEM_ROLE:  Called by OwnershipToken for all atomic loan operations
 */
contract LoanContract is ERC721, AccessControl {
    using VehicleLib for address;
    using VehicleLib for uint256;

    bytes32 public constant ADMIN_ROLE  = keccak256("ADMIN");
    bytes32 public constant BANK_ROLE   = keccak256("BANK");
    bytes32 public constant SYSTEM_ROLE = keccak256("SYSTEM");

    // ========================================================================
    // ERRORS
    // ========================================================================

    error BankExists();
    error BankNotActive();
    error BankNotFound();
    error LoanExists();
    error LoanNotFound();
    error LoanNotActive();
    error NOCAlreadyIssued();
    error Unauthorized();
    error VehicleNotFound();
    error VehicleDeactivated();
    error OwnershipContractNotSet();
    error OwnershipContractAlreadySet();
    error NocTransferBlocked();

    // ========================================================================
    // DATA STRUCTURES
    // ========================================================================

    struct Bank {
        uint64  id;
        address auth;
        bool    active;
    }

    struct Loan {
        uint64  loanId;
        uint256 dvpId;
        uint64  bankId;
        address borrower;
        uint32  issueDate;
        uint32  nocDate;
        uint16  tenure;
        bool    active;
        bool    nocIssued;
        uint128 amount;
    }

    // ========================================================================
    // STATE
    // ========================================================================

    uint64 private _loanCtr;
    uint64 private _bankCtr;

    IOwnershipToken         public ownershipContract;
    IDigitalVehiclePassport public dvpContract;

    mapping(string  => uint64) public bankCode;
    mapping(uint64  => Bank)   public banks;
    mapping(address => uint64) public addrToBank;
    mapping(uint256 => Loan)   public loans;
    mapping(uint256 => uint64) public dvpToLoan;

    // ========================================================================
    // EVENTS
    // ========================================================================

    event BankReg(uint64 indexed id, string code, address auth);
    event BankStatusToggled(uint64 indexed id, bool active);
    event LoanReg(uint64 indexed loanId, uint256 indexed dvpId, uint64 indexed bankId, address borrower, uint128 amount);
    event NOCIssued(uint64 indexed loanId, uint256 indexed dvpId);
    event NOCMinted(uint64 indexed loanId, address indexed owner);
    event LoanRefinanced(uint64 indexed oldLoanId, uint64 indexed newLoanId, uint256 indexed dvpId);
    event PendingLoanAttached(uint256 indexed dvpId, uint64 indexed bankId, address borrower, uint128 amount);
    event PendingLoanCancelled(uint256 indexed dvpId, uint64 indexed bankId);
    event ContractsLinked(address ownership, address dvp);

    // ========================================================================
    // CONSTRUCTOR
    // ========================================================================

    constructor(address _dvp) ERC721("VehicleLoanNOC", "VNOC") {
        _dvp.validateAddress();
        dvpContract = IDigitalVehiclePassport(_dvp);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    // ========================================================================
    // ADMIN — CONTRACT LINKING
    // ========================================================================

    /**
     * @dev Link the OwnershipToken contract (one-time setter).
     *      Required for ownTid validation and real-owner lookup in issueNOC.
     */
    function setOwnershipContract(address _own) external onlyRole(ADMIN_ROLE) {
        if (address(ownershipContract) != address(0)) revert OwnershipContractAlreadySet();
        _own.validateAddress();
        ownershipContract = IOwnershipToken(_own);
        emit ContractsLinked(_own, address(dvpContract));
    }

    // ========================================================================
    // BANK MANAGEMENT
    // ========================================================================

    /**
     * @dev Register a new bank. Called by MORTH admin (via Gnosis Safe).
     */
    function regBank(string calldata code, address auth) external onlyRole(ADMIN_ROLE) {
        if (bankCode[code] != 0) revert BankExists();
        auth.validateAddress();

        _bankCtr++;
        banks[_bankCtr]  = Bank(_bankCtr, auth, true);
        bankCode[code]   = _bankCtr;
        addrToBank[auth] = _bankCtr;
        _grantRole(BANK_ROLE, auth);

        emit BankReg(_bankCtr, code, auth);
    }

    /**
     * @dev Toggle bank active status (activate ↔ deactivate).
     */
    function toggleBankStatus(string calldata code) external onlyRole(ADMIN_ROLE) {
        uint64 bankId = bankCode[code];
        if (bankId == 0) revert BankNotFound();

        banks[bankId].active = !banks[bankId].active;
        emit BankStatusToggled(bankId, banks[bankId].active);
    }

    /**
     * @dev Check if bank is active.
     */
    function isBankActive(string calldata code) external view returns (bool) {
        uint64 bankId = bankCode[code];
        if (bankId == 0) return false;
        return banks[bankId].active;
    }

    // ========================================================================
    // LOAN REGISTRATION
    // ========================================================================

    /**
     * @dev ONE FUNCTION for all bank registrations.
     *      - If vehicle is Brand New: Activates instantly on DVP.
     *      - If vehicle is Used: Attaches as Pending Loan on active transfer.
     */
    function registerLoan(
        uint256 dvpId,
        address buyer,
        uint128 amount,
        uint16  tenure
    ) external onlyRole(BANK_ROLE) returns (uint64) {
        // Validate vehicle exists and is not scrapped
        if (address(ownershipContract) == address(0)) revert OwnershipContractNotSet();
        
        (bool exists, uint8 status) = dvpContract.existsAndGetStatus(dvpId);
        if (!exists) revert VehicleNotFound();
        
        // 2 = SCRAPPED. We allow 0 (NOT_REG) for new cars, and 1 (ACTIVE) for used cars.
        if (status == 2) revert VehicleDeactivated(); 

        uint64 bankId = addrToBank[msg.sender];
        if (!banks[bankId].active) revert BankNotActive();

        (bool isRegistered, , bool hasXfer, address owner) = ownershipContract.getVehicleLoanContext(dvpId);

        if (!isRegistered) {
            // BRAND NEW CAR
            if (dvpToLoan[dvpId] != 0 && loans[dvpToLoan[dvpId]].active) revert LoanExists();
            return _createLoan(dvpId, buyer, bankId, amount, tenure);
        } else {
            // REGISTERED CAR
            if (hasXfer) {
                // USED CAR TRANSFER (Attach Pending Loan)
                ownershipContract.attachPendingLoan(dvpId, bankId, buyer, amount, tenure);
                emit PendingLoanAttached(dvpId, bankId, buyer, amount);
                return 0; // Return 0 because it's pending, not active yet
            } else {
                // TITLE LOAN / REFINANCE (Directly to Current Owner)
                if (owner != buyer) revert Unauthorized();
                if (dvpToLoan[dvpId] != 0 && loans[dvpToLoan[dvpId]].active) revert LoanExists();
                return _createLoan(dvpId, buyer, bankId, amount, tenure);
            }
        }
    }

    /**
     * @dev Bank cancels a pending loan that was attached to a used-car transfer.
     */
    function cancelPendingLoan(uint256 dvpId) external onlyRole(BANK_ROLE) {
        if (address(ownershipContract) == address(0)) revert OwnershipContractNotSet();
        
        uint64 bankId = addrToBank[msg.sender];
        if (!banks[bankId].active) revert BankNotActive();

        ownershipContract.detachPendingLoan(dvpId, bankId);
        emit PendingLoanCancelled(dvpId, bankId);
    }

    /**
     * @dev System activates the pending loan during RTO transfer approval.
     */
    function systemActivatePendingLoan(
        uint256 dvpId,
        uint64  bankId,
        address borrower,
        uint128 amount,
        uint16  tenure
    ) external onlyRole(SYSTEM_ROLE) returns (uint64) {
        if (!banks[bankId].active) revert BankNotActive();
        if (dvpToLoan[dvpId] != 0 && loans[dvpToLoan[dvpId]].active) revert LoanExists();

        return _createLoan(dvpId, borrower, bankId, amount, tenure);
    }

    // ========================================================================
    // REFINANCE (same owner, same bank, updated terms)
    // ========================================================================

    function refinanceLoan(
        uint256 dvpId,
        uint128 newAmount,
        uint16  newTenure
    ) external onlyRole(BANK_ROLE) returns (uint64 newLoanId) {
        if (address(ownershipContract) == address(0)) revert OwnershipContractNotSet();
        if (!dvpContract.exists(dvpId)) revert VehicleNotFound();

        uint64 existingLoanId = dvpToLoan[dvpId];
        if (existingLoanId == 0)               revert LoanNotFound();
        if (!loans[existingLoanId].active)     revert LoanNotActive();

        uint64 bankId = addrToBank[msg.sender];
        if (!banks[bankId].active)             revert BankNotActive();

        if (loans[existingLoanId].bankId != bankId) revert Unauthorized();

        // Close old loan
        loans[existingLoanId].active  = false;
        loans[existingLoanId].nocDate = uint32(block.timestamp);

        // Issue new loan
        newLoanId = _createLoan(dvpId, loans[existingLoanId].borrower, bankId, newAmount, newTenure);

        emit LoanRefinanced(existingLoanId, newLoanId, dvpId);
        return newLoanId;
    }

    // ========================================================================
    // NOC ISSUANCE
    // ========================================================================

    /**
     * @dev Bank clears the loan. 
     *      If vehicle is not yet registered, just clears the loan.
     *      If registered, also mints NOC NFT to the owner.
     */
    function issueNOC(uint256 dvpId) external onlyRole(BANK_ROLE) {
        if (address(ownershipContract) == address(0)) revert OwnershipContractNotSet();

        uint64 loanId = dvpToLoan[dvpId];
        if (loanId == 0)          revert LoanNotFound();

        Loan storage loan = loans[loanId];
        if (!loan.active)         revert LoanNotActive();
        if (loan.nocIssued)       revert NOCAlreadyIssued();

        uint64 bankId = addrToBank[msg.sender];
        if (loan.bankId != bankId) revert Unauthorized();

        loan.nocIssued = true;
        loan.nocDate   = uint32(block.timestamp);
        loan.active    = false;

        emit NOCIssued(loanId, dvpId);

        // If registered, mint the NOC NFT
        (bool isRegistered, , , address realOwner) = ownershipContract.getVehicleLoanContext(dvpId);
        if (isRegistered && realOwner != address(0)) {
            _safeMint(realOwner, loanId);
            emit NOCMinted(loanId, realOwner);
        }
    }

    // ========================================================================
    // INTERNAL — LOAN CREATION
    // ========================================================================

    function _createLoan(
        uint256 dvpId,
        address borrower,
        uint64  bankId,
        uint128 amount,
        uint16  tenure
    ) internal returns (uint64) {
        _loanCtr++;
        uint64 loanId = _loanCtr;

        Loan storage l = loans[loanId];
        l.loanId = loanId;
        l.dvpId = dvpId;
        l.bankId = bankId;
        l.borrower = borrower;
        l.issueDate = uint32(block.timestamp);
        l.tenure = tenure;
        l.active = true;
        l.amount = amount;

        dvpToLoan[dvpId] = loanId;

        emit LoanReg(loanId, dvpId, bankId, borrower, amount);
        return loanId;
    }

    // ========================================================================
    // VIEW FUNCTIONS
    // ========================================================================

    function isLoanCleared(uint256 dvpId) external view returns (bool) {
        uint64 loanId = dvpToLoan[dvpId];
        if (loanId == 0) return true;
        return !loans[loanId].active || loans[loanId].nocIssued;
    }

    function hasActiveLoan(uint256 dvpId) external view returns (bool) {
        uint64 loanId = dvpToLoan[dvpId];
        if (loanId == 0) return false;
        return loans[loanId].active && !loans[loanId].nocIssued;
    }

    function getLoanBorrower(uint256 dvpId) external view returns (address) {
        uint64 loanId = dvpToLoan[dvpId];
        if (loanId == 0) revert LoanNotFound();
        return loans[loanId].borrower;
    }

    function getActiveLoanBorrower(uint256 dvpId) external view returns (bool hasLoan, address borrower) {
        uint64 loanId = dvpToLoan[dvpId];
        if (loanId != 0 && loans[loanId].active && !loans[loanId].nocIssued) {
            return (true, loans[loanId].borrower);
        }
        return (false, address(0));
    }

    function getLoan(uint64 loanId) external view returns (Loan memory) {
        if (loans[loanId].loanId == 0) revert LoanNotFound();
        return loans[loanId];
    }

    function getBank(uint64 bankId) external view returns (Bank memory) {
        return banks[bankId];
    }

    // ========================================================================
    // NON-TRANSFERABLE NOC NFT
    // ========================================================================

    function _update(address to, uint256 tokenId, address auth)
        internal virtual override returns (address)
    {
        address from = _ownerOf(tokenId);
        if (from != address(0)) revert NocTransferBlocked();
        return super._update(to, tokenId, auth);
    }

    function supportsInterface(bytes4 interfaceId)
        public view override(ERC721, AccessControl) returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}