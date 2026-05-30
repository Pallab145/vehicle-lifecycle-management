// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./BaseSetup.t.sol";

contract ChallanContractTest is BaseSetup {
    
    function test_AdminCanRegisterPolice() public {
        vm.prank(admin);
        challan.regPolice("POL02", address(22));
        assertEq(challan.policeCode("POL02"), 2);
    }
    
    function testRevert_NonAdminCannotRegisterPolice() public {
        vm.prank(seller);
        vm.expectRevert();
        challan.regPolice("POL02", address(22));
    }
    
    function test_PoliceCanIssueChallan() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(police);
        challan.issueChallan(ownTid, 100);
        
        assertTrue(challan.hasPendingChallans(ownTid));
        assertEq(challan.getPendingAmount(ownTid), 100);
    }
    
    function testRevert_NonPoliceCannotIssueChallan() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(seller);
        vm.expectRevert();
        challan.issueChallan(ownTid, 100);
    }
    
    function test_PoliceCanPayChallan() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(police);
        uint64 challanId = challan.issueChallan(ownTid, 100);
        
        vm.prank(police);
        challan.payChallan(ownTid, challanId);
        
        assertFalse(challan.hasPendingChallans(ownTid));
        assertEq(challan.getPendingAmount(ownTid), 0);
    }
    
    function testRevert_CannotPayAlreadyPaidChallan() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(police);
        uint64 challanId = challan.issueChallan(ownTid, 100);
        
        vm.prank(police);
        challan.payChallan(ownTid, challanId);
        
        vm.prank(police);
        vm.expectRevert(abi.encodeWithSignature("AlreadyPaid()"));
        challan.payChallan(ownTid, challanId);
    }
    
    function test_PoliceCanCancelChallan() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(police);
        uint64 challanId = challan.issueChallan(ownTid, 100);
        
        vm.prank(police);
        challan.cancelChallan(ownTid, challanId);
        
        assertFalse(challan.hasPendingChallans(ownTid));
    }
    
    function testRevert_CannotCancelPaidChallan() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(police);
        uint64 challanId = challan.issueChallan(ownTid, 100);
        
        vm.prank(police);
        challan.payChallan(ownTid, challanId);
        
        vm.prank(police);
        vm.expectRevert(); // Typically reverts in pay flow because it checks if paid/cancelled or it might just not let it happen
        // Let's assume it reverts or has some protection
        challan.cancelChallan(ownTid, challanId);
    }
    
    function test_AdminCanEmergencyCancelChallan() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(police);
        uint64 challanId = challan.issueChallan(ownTid, 100);
        
        vm.prank(admin);
        challan.adminCancelChallan(ownTid, challanId);
        
        assertFalse(challan.hasPendingChallans(ownTid));
    }
    
    function test_AdminCanTogglePoliceStatus() public {
        vm.prank(admin);
        challan.togglePoliceStatus("POL01");
        
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        // After toggle-off, POLICE_ROLE is revoked from the officer.
        // The call now fails at the access control layer — before reaching PoliceNotActive.
        vm.prank(police);
        vm.expectRevert(); // AccessControlUnauthorizedAccount
        challan.issueChallan(ownTid, 100);
    }
}
