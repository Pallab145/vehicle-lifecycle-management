// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title VehicleLib
 * @dev Shared utility library to reduce bytecode duplication
 */
library VehicleLib {
    
    error InvalidAddress();
    error InvalidTimestamp();
    error Overflow();
    
    function validateAddress(address addr) internal pure {
        if (addr == address(0)) revert InvalidAddress();
    }
    
    function hasExpired(uint256 expiryDate) internal view returns (bool) {
        return block.timestamp > expiryDate;
    }
    
    function toUint32(uint256 value) internal pure returns (uint32) {
        if (value > type(uint32).max) revert Overflow();
        return uint32(value);
    }
    
    function toUint64(uint256 value) internal pure returns (uint64) {
        if (value > type(uint64).max) revert Overflow();
        return uint64(value);
    }
    
    function toUint128(uint256 value) internal pure returns (uint128) {
        if (value > type(uint128).max) revert Overflow();
        return uint128(value);
    }
}
