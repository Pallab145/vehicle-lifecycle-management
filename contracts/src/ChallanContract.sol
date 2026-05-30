// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./VehicleLib.sol";
import "./IVehicleContracts.sol";

/**
 * @title ChallanContract
 * @dev Manages traffic violations and fines.
 *
 * ROLES:
 * - ADMIN_ROLE:  Manage police stations and override cancellations
 * - POLICE_ROLE: Issue, pay, and cancel challans (police station wallets)
 * - SYSTEM_ROLE: Called by DVP during scrapVehicle to cancel orphaned challans
 */
contract ChallanContract is AccessControl {
    using VehicleLib for address;
    using VehicleLib for uint256;

    bytes32 public constant ADMIN_ROLE  = keccak256("ADMIN");
    bytes32 public constant POLICE_ROLE = keccak256("POLICE");
    bytes32 public constant SYSTEM_ROLE = keccak256("SYSTEM");
    
    error PoliceExists();
    error EntityExists();
    error PoliceNotActive();
    error PoliceNotFound();
    error ChallanNotFound();
    error AlreadyPaid();
    error AlreadyCancelled();
    error Unauthorized();
    error VehicleNotFound();
    error VehicleNotActive();
    error ZeroAmountNotAllowed();
    error OwnershipContractAlreadySet();
    
    struct Police {
        uint64 id;
        address auth;
        bool active;
    }
    
    struct Challan {
        uint64 challanId;
        uint64 ownTid;
        uint64 policeId;
        uint32 issueDate;
        uint32 paidDate;
        uint32 cancelDate;
        bool isPaid;
        bool isCancelled;
        uint128 amount;
    }
    
    uint64 private _challanCtr;
    uint64 private _policeCtr;
    
    mapping(string => uint64) public policeCode;
    mapping(uint64 => Police) public police;
    mapping(address => uint64) public addrToPolice;
    mapping(uint256 => Challan[]) public challans;
    mapping(uint64 => uint256) private _challanToVehicleIndex;
    mapping(uint256 => uint256) public pendingChallanCount;

    /// @dev O(1) pending amount counter — avoids O(n) loop in getPendingAmount
    mapping(uint256 => uint128) public pendingAmount;

    IOwnershipToken public ownershipContract;
    
    event PoliceReg(uint64 indexed id, string code, address auth);
    event PoliceStatusToggled(uint64 indexed id, bool active);
    event ChallanIssued(uint64 indexed challanId, uint256 indexed ownTid, uint64 indexed policeId, uint128 amount);
    event ChallanPaid(uint64 indexed challanId, uint256 indexed ownTid);
    event ChallanCancelled(uint64 indexed challanId, uint256 indexed ownTid, bool isAdminCancel);
    event AllChallansCancelledOnScrap(uint256 indexed ownTid, uint256 count);
    event OwnershipContractLinked(address ownershipContract);
    
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    /**
     * @dev Link OwnershipToken — one-time setter to prevent accidental overwrites.
     */
    function setOwnershipContract(address _ownContract) external onlyRole(ADMIN_ROLE) {
        if (address(ownershipContract) != address(0)) revert OwnershipContractAlreadySet();
        _ownContract.validateAddress();
        ownershipContract = IOwnershipToken(_ownContract);
        emit OwnershipContractLinked(_ownContract);
    }
    
    // ========================================================================
    // POLICE STATION MANAGEMENT
    // ========================================================================
    
    /**
     * @dev Register police station
     */
    function regPolice(string calldata code, address auth) external onlyRole(ADMIN_ROLE) {
        if (policeCode[code] != 0) revert PoliceExists();
        if (addrToPolice[auth] != 0) revert EntityExists();
        auth.validateAddress();
        
        _policeCtr++;
        police[_policeCtr] = Police(_policeCtr, auth, true);
        policeCode[code] = _policeCtr;
        addrToPolice[auth] = _policeCtr;
        _grantRole(POLICE_ROLE, auth);
        
        emit PoliceReg(_policeCtr, code, auth);
    }
    
    /**
     * @dev Toggle police station status (activate ↔ deactivate)
     * Single function - flips between active and inactive
     */
    function togglePoliceStatus(string calldata code) 
        external onlyRole(ADMIN_ROLE) {
        uint64 policeId = policeCode[code];
        if (policeId == 0) revert PoliceNotFound();
        
        bool newState = !police[policeId].active;
        police[policeId].active = newState;
        
        if (newState) {
            _grantRole(POLICE_ROLE, police[policeId].auth);
        } else {
            _revokeRole(POLICE_ROLE, police[policeId].auth);
        }
        
        emit PoliceStatusToggled(policeId, newState);
    }
    
    /**
     * @dev Check if police station is active
     */
    function isPoliceActive(string calldata code) external view returns (bool) {
        uint64 policeId = policeCode[code];
        if (policeId == 0) return false;
        return police[policeId].active;
    }
    
    // ========================================================================
    // CHALLAN MANAGEMENT
    // ========================================================================
    
    /**
     * @dev Issue challan (traffic violation fine)
     */
    function issueChallan(
        uint256 ownTid,
        uint128 amount
    ) external onlyRole(POLICE_ROLE) returns (uint64) {
        // Amount must be positive — zero-amount challans are spam
        if (amount == 0) revert ZeroAmountNotAllowed();

        // Validate the vehicle actually exists and is active
        if (address(ownershipContract) != address(0)) {
            (bool exists, bool active) = ownershipContract.existsAndIsActive(ownTid);
            if (!exists) revert VehicleNotFound();
            if (!active) revert VehicleNotActive();
        }
        
        uint64 policeId = addrToPolice[msg.sender];
        if (!police[policeId].active) revert PoliceNotActive();
        
        _challanCtr++;
        uint64 challanId = _challanCtr;
        
        challans[ownTid].push(Challan({
            challanId: challanId,
            ownTid: ownTid.toUint64(),
            policeId: policeId,
            issueDate: uint32(block.timestamp),
            paidDate: 0,
            cancelDate: 0,
            isPaid: false,
            isCancelled: false,
            amount: amount
        }));
        
        // Store the array index for O(1) direct access in _findChallan
        // Encode both ownTid and the array index into a single uint256
        // Upper 128 bits = ownTid, Lower 128 bits = index
        uint256 index = challans[ownTid].length - 1;
        _challanToVehicleIndex[challanId] = (ownTid << 128) | index;
        pendingChallanCount[ownTid]++;
        pendingAmount[ownTid] += amount;
        
        emit ChallanIssued(challanId, ownTid, policeId, amount);
        return challanId;
    }
    
    /**
     * @dev Pay a challan. ANY active police station can mark a challan as paid.
     *      This enables real-world interstate payments (e.g. Delhi challan paid at Mumbai).
     *      cancelChallan still requires the ISSUING station — only they can withdraw their challan.
     */
    function payChallan(uint256 ownTid, uint64 challanId) external onlyRole(POLICE_ROLE) {
        Challan storage ch = _findChallan(ownTid, challanId);

        if (ch.isPaid)      revert AlreadyPaid();
        if (ch.isCancelled) revert AlreadyCancelled();

        // Any active police station can process payment — no station restriction
        uint64 policeId = addrToPolice[msg.sender];
        if (!police[policeId].active) revert PoliceNotActive();

        ch.isPaid   = true;
        ch.paidDate = uint32(block.timestamp);
        if (pendingChallanCount[ownTid] > 0) pendingChallanCount[ownTid]--;
        if (pendingAmount[ownTid] >= ch.amount) pendingAmount[ownTid] -= ch.amount;
        else pendingAmount[ownTid] = 0;

        emit ChallanPaid(challanId, ownTid);
    }
    
    /**
     * @dev Cancel a challan. Only the ISSUING police station can cancel their own challans.
     *      This prevents one station from withdrawing another station's challans.
     */
    function cancelChallan(uint256 ownTid, uint64 challanId) external onlyRole(POLICE_ROLE) {
        Challan storage ch = _findChallan(ownTid, challanId);

        if (ch.isPaid)      revert AlreadyPaid();
        if (ch.isCancelled) revert AlreadyCancelled();

        // Cancellation restricted to the issuing station
        uint64 policeId = addrToPolice[msg.sender];
        if (ch.policeId != policeId) revert Unauthorized();

        ch.isCancelled = true;
        ch.cancelDate  = uint32(block.timestamp);
        if (pendingChallanCount[ownTid] > 0) pendingChallanCount[ownTid]--;
        if (pendingAmount[ownTid] >= ch.amount) pendingAmount[ownTid] -= ch.amount;
        else pendingAmount[ownTid] = 0;

        emit ChallanCancelled(challanId, ownTid, false);
    }
    
    /**
     * @dev Admin cancel challan (court orders, system errors, appeals).
     *      Called via Gnosis Safe multi-sig — no station restriction.
     */
    function adminCancelChallan(uint256 ownTid, uint64 challanId) external onlyRole(ADMIN_ROLE) {
        Challan storage ch = _findChallan(ownTid, challanId);

        if (ch.isPaid)      revert AlreadyPaid();
        if (ch.isCancelled) revert AlreadyCancelled();

        ch.isCancelled = true;
        ch.cancelDate  = uint32(block.timestamp);
        if (pendingChallanCount[ownTid] > 0) pendingChallanCount[ownTid]--;
        if (pendingAmount[ownTid] >= ch.amount) pendingAmount[ownTid] -= ch.amount;
        else pendingAmount[ownTid] = 0;

        emit ChallanCancelled(challanId, ownTid, true);
    }

    /**
     * @dev Cancel ALL pending challans for a scrapped vehicle.
     *      Called by DVP.scrapVehicle() via SYSTEM_ROLE.
     *      Orphaned challans on scrapped vehicles can never be paid/cancelled normally
     *      because the vehicle no longer exists. This clears them atomically.
     */
    function cancelAllPendingChallans(uint256 ownTid) external onlyRole(SYSTEM_ROLE) {
        uint256 count = pendingChallanCount[ownTid];
        if (count == 0) return;

        // Mark all pending challans as cancelled
        Challan[] storage chList = challans[ownTid];
        uint256 cancelled = 0;
        for (uint256 i = 0; i < chList.length; i++) {
            if (!chList[i].isPaid && !chList[i].isCancelled) {
                chList[i].isCancelled = true;
                chList[i].cancelDate  = uint32(block.timestamp);
                cancelled++;
            }
        }

        // Reset O(1) counters
        pendingChallanCount[ownTid] = 0;
        pendingAmount[ownTid]       = 0;

        emit AllChallansCancelledOnScrap(ownTid, cancelled);
    }
    
    /**
     * @dev Internal function to find challan by ID
     * More efficient than passing index
     */
    function _findChallan(uint256 ownTid, uint64 challanId) private view returns (Challan storage) {
        uint256 encoded = _challanToVehicleIndex[challanId];
        if (encoded == 0) revert ChallanNotFound();
        
        // Decode: upper 128 bits = stored ownTid, lower 128 bits = array index
        uint256 storedOwnTid = encoded >> 128;
        uint256 index       = encoded & type(uint128).max;
        
        if (storedOwnTid != ownTid) revert ChallanNotFound();
        
        return challans[ownTid][index];
    }
    
    // ========================================================================
    // VIEW FUNCTIONS
    // ========================================================================
    
    /**
     * @dev Check if vehicle has any pending challans
     */
    function hasPendingChallans(uint256 ownTid) external view returns (bool) {
        return pendingChallanCount[ownTid] > 0;
    }
    
    /**
     * @dev Get total pending challan amount — O(1) lookup via pendingAmount counter.
     *      Replaces the previous O(n) loop that could hit gas limits on long histories.
     */
    function getPendingAmount(uint256 ownTid) external view returns (uint128) {
        return pendingAmount[ownTid];
    }
    
    /**
     * @dev Get all challans for a vehicle
     */
    function getChallans(uint256 ownTid) external view returns (Challan[] memory) {
        return challans[ownTid];
    }
    
    /**
     * @dev Get only pending challans for a vehicle
     */
    function getPendingChallans(uint256 ownTid) external view returns (Challan[] memory) {
        Challan[] storage allChallans = challans[ownTid];
        uint256 pendingCount = 0;
        
        // Count pending challans
        for (uint i = 0; i < allChallans.length; i++) {
            if (!allChallans[i].isPaid && !allChallans[i].isCancelled) {
                pendingCount++;
            }
        }
        
        // Create array of pending challans
        Challan[] memory pending = new Challan[](pendingCount);
        uint256 idx = 0;
        for (uint i = 0; i < allChallans.length; i++) {
            if (!allChallans[i].isPaid && !allChallans[i].isCancelled) {
                pending[idx] = allChallans[i];
                idx++;
            }
        }
        
        return pending;
    }
    
    /**
     * @dev Get specific challan by ID
     */
    function getChallan(uint256 ownTid, uint64 challanId) external view returns (Challan memory) {
        return _findChallan(ownTid, challanId);
    }
    
    /**
     * @dev Get police station details
     */
    function getPoliceStation(uint64 policeId) external view returns (Police memory) {
        return police[policeId];
    }
    
    /**
     * @dev Get count of challans for a vehicle
     */
    function getChallanCount(uint256 ownTid) external view returns (uint256) {
        return challans[ownTid].length;
    }
    
    /**
     * @dev Get count of pending challans for a vehicle
     */
    function getPendingChallanCount(uint256 ownTid) external view returns (uint256) {
        return pendingChallanCount[ownTid];
    }
}