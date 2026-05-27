// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "./IVehicleContracts.sol";
import "./VehicleLib.sol";

/**
 * @title OwnershipToken
 * @dev Transferable NFT representing legal vehicle ownership
 * 
 * ROLES:
 * - ADMIN_ROLE: Manage RTOs and system
 * - RTO_ROLE: Register vehicles and approve transfers
 */
contract OwnershipToken is ERC721, AccessControl {
    using VehicleLib for address;
    using VehicleLib for uint256;
    
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN");
    bytes32 public constant RTO_ROLE = keccak256("RTO");
    
    error OwnExists();
    error OwnNotFound();
    error NotActive();
    error RTOExists();
    error RTONotActive();
    error RTONotFound();
    error InvalidBuyer();
    error NotOwner();
    error NotBuyer();
    error XferNotFound();
    error AlreadyDone();
    error NotApproved();
    error DirectXferBlocked();
    error TransferAlreadyPending();
    error DealerMismatch();
    error InvalidTradeCert();
    error InvalidInsurance();
    error InvalidPUC();
    error ActiveLoanExists();
    error PendingChallansExist();
    error TradeCertAlreadyActive();
    error FutureTimestampRequired();
    error Unauthorized();
    
    struct RTO {
        uint64 id;
        address auth;
        bool active;
    }
    
    struct Own {
        uint64 ownTid;
        uint64 rtoId;
        uint256 dvpId;
        uint32 regDate;
        uint32 xferCnt;
        bool active;
        address owner;
    }
    
    struct Xfer {
        uint64 reqId;
        uint64 ownTid;
        uint64 rtoId;
        address seller;
        address buyer;
        uint32 reqDate;
        bool sellerOK;
        bool buyerOK;
        bool rtoOK;
        bool done;
    }

    struct TradeCert {
        uint64 rtoId;
        uint32 issuedOn;
        uint32 validTill;
        bool active;
    }
    
    IDigitalVehiclePassport public dvpContract;
    IInsuranceToken public insContract;
    IPUCToken public pucContract;
    ILoanContract public loanContract;
    IChallanContract public challanContract;
    
    uint64 private _tokenCtr;
    uint64 private _xferCtr;
    uint64 private _rtoCtr;
    
    mapping(string => uint64) public rtoCode;
    mapping(uint64 => RTO) public rtos;
    mapping(address => uint64) public addrToRTO;
    mapping(uint256 => Own) public owns;
    mapping(uint256 => uint256) public dvpToOwn;
    mapping(uint256 => Xfer) public activeXfer;
    mapping(uint256 => bool) public hasActiveXfer;
    mapping(address => TradeCert) public tradeCerts;
    
    event RTOReg(uint64 indexed id, string code, address auth);
    event VehicleReg(uint256 indexed ownTid, address indexed owner, uint64 indexed rtoId, uint256 dvpId);
    event XferInit(uint64 indexed reqId, uint256 indexed ownTid, address seller, address buyer);
    event XferCancelled(uint64 indexed reqId, uint256 indexed ownTid);
    event XferApproved(uint64 indexed reqId, uint8 approver);
    event XferDone(uint64 indexed reqId, uint256 indexed ownTid, address indexed newOwner);
    event RTOStatusToggled(uint64 indexed id, bool active);
    event TradeCertIssued(address indexed dealer, uint64 indexed rtoId, uint32 validTill);
    event TradeCertRevoked(address indexed dealer, uint64 indexed rtoId);
    
    constructor(address _dvp) ERC721("VehicleOwnership", "OWN") {
        _dvp.validateAddress();
        dvpContract = IDigitalVehiclePassport(_dvp);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }
    
    // Set compliance contracts
    function setContracts(address _ins, address _puc, address _loan, address _challan) 
        external onlyRole(ADMIN_ROLE) {
        if (_ins != address(0)) insContract = IInsuranceToken(_ins);
        if (_puc != address(0)) pucContract = IPUCToken(_puc);
        if (_loan != address(0)) loanContract = ILoanContract(_loan);
        if (_challan != address(0)) challanContract = IChallanContract(_challan);
    }
    
    // Register RTO
    function regRTO(string calldata code, address auth) external onlyRole(ADMIN_ROLE) {
        if (rtoCode[code] != 0) revert RTOExists();
        auth.validateAddress();
        
        _rtoCtr++;
        rtos[_rtoCtr] = RTO(_rtoCtr, auth, true);
        rtoCode[code] = _rtoCtr;
        addrToRTO[auth] = _rtoCtr;
        _grantRole(RTO_ROLE, auth);
        
        emit RTOReg(_rtoCtr, code, auth);
    }

    /**
    * @dev Toggle RTO status (activate ↔ deactivate)
    * Single function - flips between active and inactive
    */
    function toggleRTOStatus(string calldata code) 
        external onlyRole(ADMIN_ROLE) {
        uint64 rtoId = rtoCode[code];
        if (rtoId == 0) revert RTONotFound();
        
        rtos[rtoId].active = !rtos[rtoId].active;
        
        emit RTOStatusToggled(rtoId, rtos[rtoId].active);
    }

    // Add this view function for checking RTO status
    function isRTOActive(string calldata code) external view returns (bool) {
        uint64 rtoId = rtoCode[code];
        if (rtoId == 0) return false;
        return rtos[rtoId].active;
    }
    
    // Register vehicle (first sale)
    function register(uint256 dvpId, address owner, address dealer)
        external onlyRole(RTO_ROLE) returns (uint256) {
        owner.validateAddress();
        dealer.validateAddress();
        
        if (dvpToOwn[dvpId] != 0) revert OwnExists();
        
        uint64 rtoId = addrToRTO[msg.sender];
        if (!rtos[rtoId].active) revert RTONotActive();
        
        if (!_isTradeCertValid(dealer)) revert InvalidTradeCert();
        
        if (!dvpContract.exists(dvpId)) revert OwnNotFound();
        if (dvpContract.getAssignedDealer(dvpId) != dealer) revert DealerMismatch();
        
        _tokenCtr++;
        uint256 ownTid = _tokenCtr;
        
        owns[ownTid] = Own(uint64(ownTid), rtoId, dvpId, uint32(block.timestamp), 0, true, owner);
        dvpToOwn[dvpId] = ownTid;
        _safeMint(owner, ownTid);
        
        // Activate DVP
        dvpContract.activateVehicle(dvpId);
        
        emit VehicleReg(ownTid, owner, rtoId, dvpId);
        return ownTid;
    }
    
    // Initiate transfer
    function initTransfer(uint256 ownTid, address buyer) 
        external returns (uint64) {
        if (ownerOf(ownTid) != msg.sender) revert NotOwner();
        if (!owns[ownTid].active) revert NotActive();
        if (buyer == address(0) || buyer == msg.sender) revert InvalidBuyer();
        if (hasActiveXfer[ownTid]) revert TransferAlreadyPending();

        _xferCtr++;
        
        activeXfer[ownTid] = Xfer({
            reqId: _xferCtr,
            ownTid: uint64(ownTid),
            rtoId: 0,
            seller: msg.sender,
            buyer: buyer,
            reqDate: uint32(block.timestamp),
            sellerOK: true,
            buyerOK: false,
            rtoOK: false,
            done: false
        });

        hasActiveXfer[ownTid] = true;
        
        emit XferInit(_xferCtr, ownTid, msg.sender, buyer);
        emit XferApproved(_xferCtr, 0);
        return _xferCtr;
    }
    
    // Cancel or Reject transfer (Seller, Buyer, RTO, Admin, or Expired)
    function cancelTransfer(uint256 ownTid) external {
        Xfer storage req = activeXfer[ownTid];
        if (req.reqId == 0) revert XferNotFound();
        if (req.done) revert AlreadyDone();
        
        bool isSeller = req.seller == msg.sender;
        bool isBuyer = req.buyer == msg.sender;
        bool isRTO = hasRole(RTO_ROLE, msg.sender);
        bool isAdmin = hasRole(ADMIN_ROLE, msg.sender);
        bool isExpired = block.timestamp > req.reqDate + 30 days;

        if (!isSeller && !isBuyer && !isRTO && !isAdmin && !isExpired) {
            revert Unauthorized();
        }
        
        uint64 reqId = req.reqId;
        
        delete activeXfer[ownTid];
        delete hasActiveXfer[ownTid];
        
        emit XferCancelled(reqId, ownTid);
    }
    
    // Buyer accepts
    function acceptTransfer(uint256 ownTid) external {
        Xfer storage req = activeXfer[ownTid];
        if (req.buyer != msg.sender) revert NotBuyer();
        if (req.done) revert AlreadyDone();
        if (!req.sellerOK) revert NotApproved();
        
        req.buyerOK = true;
        emit XferApproved(req.reqId, 1);
    }
    
    // RTO approves transfer
    function approveTransfer(uint256 ownTid) 
        external onlyRole(RTO_ROLE) {
        Xfer storage req = activeXfer[ownTid];
        if (!req.sellerOK || !req.buyerOK) revert NotApproved();
        if (req.done) revert AlreadyDone();

        uint64 rtoId = addrToRTO[msg.sender];
        if (!rtos[rtoId].active) revert RTONotActive();
        
        _validateTransfer(ownTid);
        
        req.rtoOK = true;
        req.done = true;
        req.rtoId = rtoId;
        
        owns[ownTid].owner = req.buyer;
        owns[ownTid].xferCnt++;
        
        _transfer(req.seller, req.buyer, ownTid);
        
        emit XferApproved(req.reqId, 2);
        emit XferDone(req.reqId, ownTid, req.buyer);

        delete activeXfer[ownTid];
        delete hasActiveXfer[ownTid];
    }
    
    function _validateTransfer(uint256 ownTid) private view {
        if (address(insContract) != address(0)) {
            if (!insContract.isInsuranceValid(ownTid)) revert InvalidInsurance();
        }
        if (address(pucContract) != address(0)) {
            if (!pucContract.isPUCValid(ownTid)) revert InvalidPUC();
        }
        if (address(loanContract) != address(0)) {
            if (!loanContract.isLoanCleared(ownTid)) revert ActiveLoanExists();
        }
        if (address(challanContract) != address(0)) {
            if (challanContract.hasPendingChallans(ownTid)) revert PendingChallansExist();
        }
    }

    function issueTradeCert(address dealer, uint32 validTill) external onlyRole(RTO_ROLE) {
        dealer.validateAddress();
        if (validTill <= uint32(block.timestamp)) revert FutureTimestampRequired();

        uint64 rtoId = addrToRTO[msg.sender];
        if (!rtos[rtoId].active) revert RTONotActive();

        TradeCert storage tc = tradeCerts[dealer];
        if (tc.active && block.timestamp <= tc.validTill) revert TradeCertAlreadyActive();

        tradeCerts[dealer] = TradeCert({
            rtoId: rtoId,
            issuedOn: uint32(block.timestamp),
            validTill: validTill,
            active: true
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
        return (
            tc.active &&
            block.timestamp <= tc.validTill
        );
    }

    // View functions
    function exists(uint256 ownTid) public view returns (bool) {
        return owns[ownTid].ownTid != 0;
    }
    
    function isActive(uint256 ownTid) external view returns (bool) {
        return owns[ownTid].active;
    }
    
    function currentOwner(uint256 ownTid) external view returns (address) {
        return owns[ownTid].owner;
    }
    
    function dvpTokenId(uint256 ownTid) external view returns (uint256) {
        return owns[ownTid].dvpId;
    }
    
    // Block direct transfers
    
    /**
    * @dev Override _update to control transfer logic
    * - Allow minting (from == address(0))
    * - Allow internal transfers via _transfer (called by approveTransfer)
    * - Block direct external transfers
    */
    function _update(address to, uint256 tokenId, address auth) 
        internal virtual override returns (address) {
        address from = _ownerOf(tokenId);
        
        // Allow minting
        if (from == address(0)) {
            return super._update(to, tokenId, auth);
        }
        
        // Allow internal transfers (when called from approveTransfer via _transfer)
        // auth will be address(0) when called internally via _transfer
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