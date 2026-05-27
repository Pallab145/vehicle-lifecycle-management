// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./VehicleLib.sol";

/**
 * @title LoanContract
 * @dev Manages vehicle loans and NOCs (as non-transferable NFTs)
 * 
 * ROLES:
 * - ADMIN_ROLE: Manage banks
 * - BANK_ROLE: Register loans and issue NOCs
 */
contract LoanContract is ERC721, AccessControl {
    using VehicleLib for address;
    using VehicleLib for uint256;
    
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN");
    bytes32 public constant BANK_ROLE = keccak256("BANK");
    
    error BankExists();
    error BankNotActive();
    error BankNotFound();
    error LoanExists();
    error LoanNotFound();
    error NOCAlreadyIssued();
    error Unauthorized();
    
    struct Bank {
        uint64 id;
        address auth;
        bool active;
    }
    
    struct Loan {
        uint64 loanId;
        uint64 ownTid;
        uint64 bankId;
        uint32 issueDate;
        uint32 nocDate;
        uint16 tenure;
        bool active;
        bool nocIssued;
        uint128 amount;
    }
    
    uint64 private _loanCtr;
    uint64 private _bankCtr;
    
    mapping(string => uint64) public bankCode;
    mapping(uint64 => Bank) public banks;
    mapping(address => uint64) public addrToBank;
    mapping(uint256 => Loan) public loans;
    mapping(uint256 => uint64) public ownToLoan;
    
    event BankReg(uint64 indexed id, string code, address auth);
    event BankStatusToggled(uint64 indexed id, bool active);
    event LoanReg(uint64 indexed loanId, uint256 indexed ownTid, uint64 indexed bankId, uint128 amount);
    event NOCIssued(uint64 indexed loanId, uint256 indexed ownTid, address indexed owner);
    
    constructor() ERC721("VehicleLoanNOC", "VNOC") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }
    
    // ========================================================================
    // BANK MANAGEMENT
    // ========================================================================
    
    /**
     * @dev Register bank
     */
    function regBank(string calldata code, address auth) external onlyRole(ADMIN_ROLE) {
        if (bankCode[code] != 0) revert BankExists();
        auth.validateAddress();
        
        _bankCtr++;
        banks[_bankCtr] = Bank(_bankCtr, auth, true);
        bankCode[code] = _bankCtr;
        addrToBank[auth] = _bankCtr;
        _grantRole(BANK_ROLE, auth);
        
        emit BankReg(_bankCtr, code, auth);
    }
    
    /**
     * @dev Toggle bank status (activate ↔ deactivate)
     * Single function - flips between active and inactive
     */
    function toggleBankStatus(string calldata code) 
        external onlyRole(ADMIN_ROLE) {
        uint64 bankId = bankCode[code];
        if (bankId == 0) revert BankNotFound();
        
        banks[bankId].active = !banks[bankId].active;
        
        emit BankStatusToggled(bankId, banks[bankId].active);
    }
    
    /**
     * @dev Check if bank is active
     */
    function isBankActive(string calldata code) external view returns (bool) {
        uint64 bankId = bankCode[code];
        if (bankId == 0) return false;
        return banks[bankId].active;
    }
    
    // ========================================================================
    // LOAN MANAGEMENT
    // ========================================================================
    
    /**
     * @dev Register loan
     */
    function registerLoan(
        uint256 ownTid,
        uint128 amount,
        uint16 tenure
    ) external onlyRole(BANK_ROLE) returns (uint64) {
        if (ownToLoan[ownTid] != 0 && loans[ownToLoan[ownTid]].active) revert LoanExists();
        
        uint64 bankId = addrToBank[msg.sender];
        if (!banks[bankId].active) revert BankNotActive();
        
        _loanCtr++;
        uint64 loanId = _loanCtr;
        
        loans[loanId] = Loan({
            loanId: loanId,
            ownTid: ownTid.toUint64(),
            bankId: bankId,
            issueDate: uint32(block.timestamp),
            nocDate: 0,
            tenure: tenure,
            active: true,
            nocIssued: false,
            amount: amount
        });
        
        ownToLoan[ownTid] = loanId;
        
        emit LoanReg(loanId, ownTid, bankId, amount);
        return loanId;
    }
    
    /**
     * @dev Issue NOC (No Objection Certificate) - Mints NFT to vehicle owner
     */
    function issueNOC(uint256 ownTid, address owner) external onlyRole(BANK_ROLE) {
        owner.validateAddress();
        
        uint64 loanId = ownToLoan[ownTid];
        if (loanId == 0) revert LoanNotFound();
        
        Loan storage loan = loans[loanId];
        if (!loan.active) revert LoanNotFound();
        if (loan.nocIssued) revert NOCAlreadyIssued();
        
        uint64 bankId = addrToBank[msg.sender];
        if (loan.bankId != bankId) revert Unauthorized();
        
        loan.nocIssued = true;
        loan.nocDate = uint32(block.timestamp);
        loan.active = false;
        
        // Mint NOC NFT to vehicle owner
        _safeMint(owner, loanId);
        
        emit NOCIssued(loanId, ownTid, owner);
    }
    
    // ========================================================================
    // VIEW FUNCTIONS
    // ========================================================================
    
    /**
     * @dev Check if loan is cleared (no active loan or NOC issued)
     */
    function isLoanCleared(uint256 ownTid) external view returns (bool) {
        uint64 loanId = ownToLoan[ownTid];
        if (loanId == 0) return true;
        
        return !loans[loanId].active || loans[loanId].nocIssued;
    }
    
    /**
     * @dev Get loan details
     */
    function getLoan(uint64 loanId) external view returns (Loan memory) {
        if (loans[loanId].loanId == 0) revert LoanNotFound();
        return loans[loanId];
    }
    
    /**
     * @dev Get loan by vehicle ownership token
     */
    function getVehicleLoan(uint256 ownTid) external view returns (Loan memory) {
        uint64 loanId = ownToLoan[ownTid];
        if (loanId == 0) revert LoanNotFound();
        return loans[loanId];
    }
    
    /**
     * @dev Get bank details
     */
    function getBank(uint64 bankId) external view returns (Bank memory) {
        return banks[bankId];
    }
    
    /**
     * @dev Check if vehicle has active loan
     */
    function hasActiveLoan(uint256 ownTid) external view returns (bool) {
        uint64 loanId = ownToLoan[ownTid];
        if (loanId == 0) return false;
        return loans[loanId].active && !loans[loanId].nocIssued;
    }
    
    // ========================================================================
    // NON-TRANSFERABLE NFT
    // ========================================================================
    
    /**
     * @dev Override _update to prevent transfers
     * NOC NFTs are bound to the vehicle owner and cannot be transferred
     */
    function _update(address to, uint256 tokenId, address auth) 
        internal virtual override returns (address) {
        address from = _ownerOf(tokenId);
        
        // Allow minting (from == address(0))
        // Block all transfers
        if (from != address(0)) {
            revert("NOC certificates are non-transferable");
        }
        
        return super._update(to, tokenId, auth);
    }
    
    function supportsInterface(bytes4 interfaceId)
        public view override(ERC721, AccessControl) returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}