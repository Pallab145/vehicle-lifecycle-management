// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Vehicle Registry Interfaces
 * @dev Standard interfaces for cross-contract communication.
 *      All cross-contract calls MUST go through these interfaces.
 */

interface IDigitalVehiclePassport {
    function exists(uint256 tokenId) external view returns (bool);
    function getStatus(uint256 tokenId) external view returns (uint8);
    function existsAndGetStatus(uint256 tokenId) external view returns (bool, uint8);
    function getRegistrationContext(uint256 dvpId) external view returns (bool exists, uint8 status, address dealer);
    function ownerOf(uint256 tokenId) external view returns (address);
    function getVinHash(uint256 tokenId) external view returns (bytes32);
    function getAssignedDealer(uint256 tokenId) external view returns (address);
    function activateVehicle(uint256 tokenId) external;
}

interface IOwnershipToken {
    /// @notice Check if an ownTid exists in the registry
    function exists(uint256 ownTid) external view returns (bool);

    /// @notice Check if a DVP has been registered (ownTid exists for it)
    function isRegistered(uint256 dvpId) external view returns (bool);

    /// @notice Check if an ownership record is active (not scrapped)
    function isActive(uint256 ownTid) external view returns (bool);

    /// @notice Returns the current owner wallet of the vehicle
    function currentOwner(uint256 ownTid) external view returns (address);

    /// @notice Returns the DVP token ID linked to this ownTid
    function dvpTokenId(uint256 ownTid) external view returns (uint256);

    /// @notice Returns the ownTid linked to a DVP token ID
    /// @dev Used by DVP.scrapVehicle to find the matching ownTid
    function dvpToOwn(uint256 dvpId) external view returns (uint256);

    /// @notice Returns true if there is an active pending transfer for this vehicle
    /// @dev Used by DVP.scrapVehicle to block scrap mid-transfer
    function hasActiveXfer(uint256 ownTid) external view returns (bool);

    /// @notice Bulk fetch context for Loan Contract (saves 4 CCIs)
    function getVehicleLoanContext(uint256 dvpId) external view returns (bool isReg, uint256 ownTid, bool hasXfer, address owner);

    /// @notice Bulk fetch to verify existence and active status (saves 2 CCIs)
    function existsAndIsActive(uint256 ownTid) external view returns (bool exists, bool active);

    /// @notice Called by DVP during scrapVehicle to burn the ownership NFT
    /// @dev Only callable by SYSTEM_ROLE (granted to DVP contract)
    function deactivateVehicle(uint256 ownTid) external;

    /// @notice Attaches a pending loan to an active transfer request.
    /// @dev Called exclusively by LoanContract (SYSTEM_ROLE).
    function attachPendingLoan(
        uint256 dvpId,
        uint64  bankId,
        address buyer,
        uint128 amount,
        uint16  tenure
    ) external;

    /// @notice Detaches a pending loan from an active transfer request.
    /// @dev Called exclusively by LoanContract (SYSTEM_ROLE).
    function detachPendingLoan(uint256 dvpId, uint64 bankId) external;
}

interface IInsuranceToken {
    /// @notice Returns true if there is a valid, unexpired, active insurance policy
    function isInsuranceValid(uint256 ownTid) external view returns (bool);

    /// @notice Terminates the insurance policy when a vehicle is scrapped
    /// @dev Only callable by SYSTEM_ROLE (granted to DVP contract)
    function terminatePolicy(uint256 ownTid) external;
}

interface IPUCToken {
    /// @notice Returns true if there is a valid, unexpired PUC certificate
    function isPUCValid(uint256 ownTid) external view returns (bool);

    /// @notice Terminates the PUC certificate when a vehicle is scrapped
    /// @dev Only callable by SYSTEM_ROLE (granted to DVP contract)
    function terminatePUC(uint256 ownTid) external;
}

interface ILoanContract {
    /// @notice Returns true if there is NO active loan on this physical vehicle
    function isLoanCleared(uint256 dvpId) external view returns (bool);

    /// @notice Returns true if there IS an active loan on this physical vehicle
    function hasActiveLoan(uint256 dvpId) external view returns (bool);

    /// @notice Returns the wallet address of the borrower for the active loan
    function getLoanBorrower(uint256 dvpId) external view returns (address);

    /// @notice Bulk fetch to verify active loan and get borrower (saves 2 CCIs)
    function getActiveLoanBorrower(uint256 dvpId) external view returns (bool hasLoan, address borrower);

    /// @notice Activates a pending loan atomically during RTO transfer approval.
    /// @dev Only callable by SYSTEM_ROLE (OwnershipToken).
    function systemActivatePendingLoan(
        uint256 dvpId,
        uint64  bankId,
        address borrower,
        uint128 amount,
        uint16  tenure
    ) external returns (uint64 loanId);
}

interface IChallanContract {
    /// @notice Returns true if there are unpaid challans on this vehicle
    function hasPendingChallans(uint256 ownTid) external view returns (bool);

    /// @notice Cancels all pending challans when a vehicle is scrapped
    /// @dev Only callable by SYSTEM_ROLE (granted to DVP contract)
    function cancelAllPendingChallans(uint256 ownTid) external;
}