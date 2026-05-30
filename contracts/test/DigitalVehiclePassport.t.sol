// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./BaseSetup.t.sol";

contract DigitalVehiclePassportTest is BaseSetup {
    
    function test_AdminCanRegisterMfg() public {
        vm.prank(admin);
        dvp.regMfg("MFG02", address(22));
        assertEq(dvp.mfgCode("MFG02"), 2);
    }
    
    function testRevert_NonAdminCannotRegisterMfg() public {
        vm.prank(seller);
        vm.expectRevert();
        dvp.regMfg("MFG02", address(22));
    }
    
    function testRevert_CannotRegisterDuplicateMfgCode() public {
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSignature("EntityExists()"));
        dvp.regMfg("MFG01", address(22));
    }
    
    function test_MfgCanManufactureVehicle() public {
        vm.prank(mfg);
        uint256 dvpId = dvp.manufacture(
            bytes32("VIN999"), bytes32("SPEC"), bytes32("ENG"), bytes32("CHA")
        );
        assertEq(dvp.ownerOf(dvpId), mfg);
    }
    
    function testRevert_NonMfgCannotManufacture() public {
        vm.prank(seller);
        vm.expectRevert();
        dvp.manufacture(bytes32("VIN999"), bytes32("SPEC"), bytes32("ENG"), bytes32("CHA"));
    }
    
    function testRevert_DuplicateVINReverts() public {
        vm.startPrank(mfg);
        dvp.manufacture(bytes32("VIN999"), bytes32("SPEC"), bytes32("ENG"), bytes32("CHA"));
        
        vm.expectRevert(abi.encodeWithSignature("VehicleExists()"));
        dvp.manufacture(bytes32("VIN999"), bytes32("SPEC"), bytes32("ENG"), bytes32("CHA"));
        vm.stopPrank();
    }
    
    function test_MfgCanAssignToDealer() public {
        vm.startPrank(mfg);
        uint256 dvpId = dvp.manufacture(
            bytes32("VIN999"), bytes32("SPEC"), bytes32("ENG"), bytes32("CHA")
        );
        dvp.assignToDealer(dvpId, dealer);
        vm.stopPrank();
        
        assertEq(dvp.getAssignedDealer(dvpId), dealer);
    }
    
    function testRevert_CannotAssignUnownedVehicle() public {
        vm.prank(mfg);
        uint256 dvpId = dvp.manufacture(
            bytes32("VIN999"), bytes32("SPEC"), bytes32("ENG"), bytes32("CHA")
        );
        
        // Another mfg tries to assign it
        address mfg2 = address(22);
        vm.prank(admin);
        dvp.regMfg("MFG02", mfg2);
        
        vm.prank(mfg2);
        vm.expectRevert(abi.encodeWithSignature("NotYourVehicle()"));
        dvp.assignToDealer(dvpId, dealer);
    }
    
    function testRevert_CannotAssignAlreadyActivatedVehicle() public {
        (uint256 dvpId, ) = _createAndRegisterVehicle();
        
        // Vehicle is now active, trying to re-assign to dealer should fail
        vm.prank(mfg);
        vm.expectRevert(abi.encodeWithSignature("NotEligible()"));
        dvp.assignToDealer(dvpId, address(99));
    }
    
    function test_AdminCanToggleMfgStatus() public {
        vm.prank(admin);
        dvp.toggleMfg("MFG01"); // Deactivates
        
        // Mfg should now be blocked from manufacturing
        vm.prank(mfg);
        vm.expectRevert();
        dvp.manufacture(bytes32("VIN999"), bytes32("SPEC"), bytes32("ENG"), bytes32("CHA"));
    }
    
    function test_ScrapCenterCanScrapActiveVehicle() public {
        (uint256 dvpId, ) = _createAndRegisterVehicle();
        
        // Setup Scrap Center
        address sc = address(99);
        vm.prank(admin);
        dvp.regScrap("SCRP01", sc);
        
        // Authorize scrap center
        vm.prank(seller);
        dvp.authorizeScrap(dvpId, "SCRP01");
        
        vm.prank(sc);
        dvp.scrapVehicle(dvpId);
        
        // Verify status
        (,,,,, DigitalVehiclePassport.Status status,,,,) = dvp.passports(dvpId);
        assertEq(uint(status), uint(DigitalVehiclePassport.Status.SCRAPPED));
    }
}
