// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Vehicle Registry Interfaces
 * @dev Standard interfaces for cross-contract communication
 */

interface IDigitalVehiclePassport {
    function exists(uint256 tokenId) external view returns (bool);
    function getStatus(uint256 tokenId) external view returns (uint8);
    function ownerOf(uint256 tokenId) external view returns (address);
    function getVinHash(uint256 tokenId) external view returns (bytes32);
    function getAssignedDealer(uint256 tokenId) external view returns (address);
    function activateVehicle(uint256 tokenId) external;
}

interface IOwnershipToken {
    function exists(uint256 ownTid) external view returns (bool);
    function isActive(uint256 ownTid) external view returns (bool);
    function currentOwner(uint256 ownTid) external view returns (address);
    function dvpTokenId(uint256 ownTid) external view returns (uint256);
}

interface IInsuranceToken {
    function isInsuranceValid(uint256 ownTid) external view returns (bool);
}

interface IPUCToken {
    function isPUCValid(uint256 ownTid) external view returns (bool);
}

interface ILoanContract {
    function isLoanCleared(uint256 ownTid) external view returns (bool);
}

interface IChallanContract {
    function hasPendingChallans(uint256 ownTid) external view returns (bool);
}