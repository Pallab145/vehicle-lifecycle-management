// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./BaseSetup.t.sol";

contract PUCTokenTest is BaseSetup {
    
    function test_AdminCanRegisterCenter() public {
        vm.prank(admin);
        puc.regCenter("PUC02", address(22));
        assertEq(puc.centerCode("PUC02"), 2);
    }
    
    function testRevert_NonAdminCannotRegisterCenter() public {
        vm.prank(seller);
        vm.expectRevert();
        puc.regCenter("PUC02", address(22));
    }
    
    function test_CenterCanIssuePUC() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(pucCenter);
        puc.issuePUC(ownTid, uint32(block.timestamp + 180 days), 10, 10, 10, true);
        
        assertTrue(puc.isPUCValid(ownTid));
    }
    
    function testRevert_CannotIssueFailedPUC() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(pucCenter);
        vm.expectRevert(abi.encodeWithSignature("TestFailed()"));
        puc.issuePUC(ownTid, uint32(block.timestamp + 180 days), 10, 10, 10, false);
    }
    
    function testRevert_NonCenterCannotIssuePUC() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(seller);
        vm.expectRevert();
        puc.issuePUC(ownTid, uint32(block.timestamp + 180 days), 10, 10, 10, true);
    }
    
    function testRevert_CannotIssueMultipleActivePUCs() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(pucCenter);
        puc.issuePUC(ownTid, uint32(block.timestamp + 180 days), 10, 10, 10, true);
        
        vm.prank(pucCenter);
        vm.expectRevert(abi.encodeWithSignature("CertExists()"));
        puc.issuePUC(ownTid, uint32(block.timestamp + 180 days), 10, 10, 10, true);
    }
    
    function test_PUCExpiresExactlyOnTime() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(pucCenter);
        puc.issuePUC(ownTid, uint32(block.timestamp + 10 days), 10, 10, 10, true);
        
        vm.warp(block.timestamp + 10 days);
        assertTrue(puc.isPUCValid(ownTid));
        
        vm.warp(block.timestamp + 11 days);
        assertFalse(puc.isPUCValid(ownTid));
    }
    
    function test_CanIssueNewPUCAfterExpiry() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(pucCenter);
        puc.issuePUC(ownTid, uint32(block.timestamp + 10 days), 10, 10, 10, true);
        
        vm.warp(block.timestamp + 11 days);
        assertFalse(puc.isPUCValid(ownTid));
        
        vm.prank(pucCenter);
        puc.issuePUC(ownTid, uint32(block.timestamp + 180 days), 10, 10, 10, true);
        assertTrue(puc.isPUCValid(ownTid));
    }
    
    function test_AdminCanToggleCenterStatus() public {
        vm.prank(admin);
        puc.toggleCenterStatus("PUC01");
        
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(pucCenter);
        vm.expectRevert(abi.encodeWithSignature("CenterNotActive()"));
        puc.issuePUC(ownTid, uint32(block.timestamp + 180 days), 10, 10, 10, true);
    }
}
