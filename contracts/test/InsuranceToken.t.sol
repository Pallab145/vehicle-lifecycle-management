// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./BaseSetup.t.sol";

contract InsuranceTokenTest is BaseSetup {
    
    function test_AdminCanRegisterInsurer() public {
        vm.prank(admin);
        insurance.regIns("INS02", address(22));
        assertEq(insurance.insCode("INS02"), 2);
    }
    
    function testRevert_NonAdminCannotRegisterInsurer() public {
        vm.prank(seller);
        vm.expectRevert();
        insurance.regIns("INS02", address(22));
    }
    
    function test_InsurerCanIssuePolicy() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(insurer);
        uint64 polId = insurance.issuePolicy(ownTid, seller, uint32(block.timestamp + 365 days), 50000, 1000);
        
        assertTrue(insurance.isInsuranceValid(ownTid));
        assertEq(insurance.ownerOf(polId), seller);
    }
    
    function testRevert_NonInsurerCannotIssuePolicy() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(seller);
        vm.expectRevert();
        insurance.issuePolicy(ownTid, seller, uint32(block.timestamp + 365 days), 50000, 1000);
    }
    
    function test_PolicyExpiresExactlyOnTime() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(insurer);
        insurance.issuePolicy(ownTid, seller, uint32(block.timestamp + 10 days), 50000, 1000);
        
        vm.warp(block.timestamp + 10 days);
        assertTrue(insurance.isInsuranceValid(ownTid));
        
        vm.warp(block.timestamp + 11 days);
        assertFalse(insurance.isInsuranceValid(ownTid));
    }
    
    function testRevert_CannotIssueMultipleActivePolicies() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(insurer);
        insurance.issuePolicy(ownTid, seller, uint32(block.timestamp + 365 days), 50000, 1000);
        
        vm.prank(insurer);
        vm.expectRevert(abi.encodeWithSignature("PolicyExists()"));
        insurance.issuePolicy(ownTid, seller, uint32(block.timestamp + 365 days), 50000, 1000);
    }
    
    function test_CanIssueNewPolicyAfterExpiry() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(insurer);
        insurance.issuePolicy(ownTid, seller, uint32(block.timestamp + 10 days), 50000, 1000);
        
        vm.warp(block.timestamp + 11 days);
        assertFalse(insurance.isInsuranceValid(ownTid));
        
        // Issue new one
        vm.prank(insurer);
        insurance.issuePolicy(ownTid, seller, uint32(block.timestamp + 365 days), 50000, 1000);
        assertTrue(insurance.isInsuranceValid(ownTid));
    }
    
    function test_AdminCanToggleInsurer() public {
        vm.prank(admin);
        insurance.toggleInsurerStatus("INS01");
        
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(insurer);
        vm.expectRevert(abi.encodeWithSignature("InsNotActive()"));
        insurance.issuePolicy(ownTid, seller, uint32(block.timestamp + 365 days), 50000, 1000);
    }
    
    function test_FileClaimIncrementsCounter() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(insurer);
        uint64 polId = insurance.issuePolicy(ownTid, seller, uint32(block.timestamp + 365 days), 50000, 1000);
        
        vm.prank(insurer);
        insurance.fileClaim(polId);
        
        (,,,,, uint32 claimCnt,,,) = insurance.policies(polId);
        assertEq(claimCnt, 1);
    }
    
    function testRevert_CannotFileClaimOnExpiredPolicy() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(insurer);
        uint64 polId = insurance.issuePolicy(ownTid, seller, uint32(block.timestamp + 10 days), 50000, 1000);
        
        vm.warp(block.timestamp + 11 days);
        
        insurance.markExpired(polId); // Assume anyone can call markExpired since it just checks time
        
        vm.prank(insurer);
        vm.expectRevert(abi.encodeWithSignature("InsNotActive()")); // or something similar based on active flag
        insurance.fileClaim(polId);
    }
}
