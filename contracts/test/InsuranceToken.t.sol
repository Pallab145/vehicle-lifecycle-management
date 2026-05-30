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
        insurance.issuePolicy(ownTid, uint32(block.timestamp + 365 days), 50000, 1000);
        
        assertTrue(insurance.isInsuranceValid(ownTid));
    }
    
    function testRevert_NonInsurerCannotIssuePolicy() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(seller);
        vm.expectRevert();
        insurance.issuePolicy(ownTid, uint32(block.timestamp + 365 days), 50000, 1000);
    }
    
    function test_PolicyExpiresExactlyOnTime() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(insurer);
        insurance.issuePolicy(ownTid, uint32(block.timestamp + 10 days), 50000, 1000);
        
        vm.warp(block.timestamp + 10 days);
        assertTrue(insurance.isInsuranceValid(ownTid));
        
        vm.warp(block.timestamp + 11 days);
        assertFalse(insurance.isInsuranceValid(ownTid));
    }
    
    function testRevert_CannotIssueMultipleActivePolicies() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(insurer);
        insurance.issuePolicy(ownTid, uint32(block.timestamp + 365 days), 50000, 1000);
        
        vm.prank(insurer);
        vm.expectRevert(abi.encodeWithSignature("PolicyExists()"));
        insurance.issuePolicy(ownTid, uint32(block.timestamp + 365 days), 50000, 1000);
    }
    
    function test_CanIssueNewPolicyAfterExpiry() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(insurer);
        insurance.issuePolicy(ownTid, uint32(block.timestamp + 10 days), 50000, 1000);
        
        vm.warp(block.timestamp + 11 days);
        assertFalse(insurance.isInsuranceValid(ownTid));
        
        // Issue new one
        vm.prank(insurer);
        insurance.issuePolicy(ownTid, uint32(block.timestamp + 365 days), 50000, 1000);
        assertTrue(insurance.isInsuranceValid(ownTid));
    }
    
    function test_AdminCanToggleInsurer() public {
        vm.prank(admin);
        insurance.toggleInsurerStatus("INS01");
        
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        // After toggle-off, INS_ROLE is revoked from the insurer.
        // The call now fails at the access control layer — before reaching InsNotActive.
        vm.prank(insurer);
        vm.expectRevert(); // AccessControlUnauthorizedAccount
        insurance.issuePolicy(ownTid, uint32(block.timestamp + 365 days), 50000, 1000);
    }
    
    function test_FileClaimIncrementsCounter() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(insurer);
        uint64 polId = insurance.issuePolicy(ownTid, uint32(block.timestamp + 365 days), 50000, 1000);
        
        vm.prank(insurer);
        insurance.fileClaim(polId);
        
        (,,,,, uint32 claimCnt,,,) = insurance.policies(polId);
        assertEq(claimCnt, 1);
    }
    
    function testRevert_CannotFileClaimOnExpiredPolicy() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(insurer);
        uint64 polId = insurance.issuePolicy(ownTid, uint32(block.timestamp + 10 days), 50000, 1000);
        
        vm.warp(block.timestamp + 11 days);
        
        vm.prank(insurer);
        insurance.markExpired(polId); // Now requires INS_ROLE
        
        vm.prank(insurer);
        // fileClaim now throws PolicyNotActive() for expired/inactive policies
        vm.expectRevert(abi.encodeWithSignature("PolicyNotActive()"));
        insurance.fileClaim(polId);
    }
}
