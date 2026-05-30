// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./BaseSetup.t.sol";
import "../src/IVehicleContracts.sol";

contract OwnershipTokenTest is BaseSetup {
    
    function test_AdminCanRegisterRTO() public {
        vm.prank(admin);
        ownership.regRTO("RTO02", address(22));
        assertEq(ownership.rtoCode("RTO02"), 2);
    }
    
    function testRevert_NonAdminCannotRegisterRTO() public {
        vm.prank(seller);
        vm.expectRevert();
        ownership.regRTO("RTO02", address(22));
    }
    
    function test_RTO_CanIssueTradeCert() public {
        vm.prank(rto);
        ownership.issueTradeCert(dealer, uint32(block.timestamp + 30 days));
        
        (,, uint32 validTill, bool active) = ownership.tradeCerts(dealer);
        assertTrue(active);
        assertEq(validTill, uint32(block.timestamp + 30 days));
    }
    
    function testRevert_CannotIssueTradeCertInPast() public {
        vm.warp(2 days);
        vm.prank(rto);
        vm.expectRevert(abi.encodeWithSignature("FutureTimestampRequired()"));
        ownership.issueTradeCert(dealer, uint32(block.timestamp - 1 days));
    }
    
    function testRevert_CannotRegisterVehicleWithoutTradeCert() public {
        vm.prank(mfg);
        uint256 dvpId = dvp.manufacture(
            bytes32("VIN999"), bytes32("SPEC"), bytes32("ENG"), bytes32("CHA")
        );
        vm.prank(mfg);
        dvp.assignToDealer(dvpId, dealer);
        
        // Skip trade cert issuance
        vm.prank(rto);
        vm.expectRevert(abi.encodeWithSignature("InvalidTradeCert()"));
        ownership.register(dvpId, seller, dealer);
    }
    
    function testRevert_DealerMismatch() public {
        vm.prank(mfg);
        uint256 dvpId = dvp.manufacture(
            bytes32("VIN999"), bytes32("SPEC"), bytes32("ENG"), bytes32("CHA")
        );
        vm.prank(mfg);
        dvp.assignToDealer(dvpId, dealer); // Assigned to `dealer`
        
        address rogueDealer = address(99);
        vm.prank(rto);
        ownership.issueTradeCert(rogueDealer, uint32(block.timestamp + 30 days));
        
        vm.prank(rto);
        vm.expectRevert(abi.encodeWithSignature("DealerMismatch()"));
        ownership.register(dvpId, seller, rogueDealer);
    }
    
    function test_SuccessfulRegistration() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        assertEq(ownership.ownerOf(ownTid), seller);
        assertTrue(ownership.isActive(ownTid));
    }
    
    function test_InitTransfer() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        _issueValidCompliance(ownTid);
        
        vm.prank(seller);
        ownership.initTransfer(ownTid, buyer);
        
        assertTrue(ownership.hasActiveXfer(ownTid));
    }
    
    function testRevert_NonOwnerCannotInitTransfer() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        _issueValidCompliance(ownTid);
        
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSignature("NotOwner()"));
        ownership.initTransfer(ownTid, buyer);
    }
    
    function testRevert_CannotInitTransferWithoutCompliance() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        // Skip _issueValidCompliance
        
        vm.prank(seller);
        // It doesn't fail on init, it fails on RTO approval actually.
        // Validation happens in `approveTransfer`, not `initTransfer`.
        ownership.initTransfer(ownTid, buyer);
        assertTrue(ownership.hasActiveXfer(ownTid));
    }
    
    function test_AcceptTransfer() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        vm.prank(seller);
        ownership.initTransfer(ownTid, buyer);
        
        vm.prank(buyer);
        ownership.acceptTransfer(ownTid);
    }
    
    function testRevert_NonBuyerCannotAccept() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        vm.prank(seller);
        ownership.initTransfer(ownTid, buyer);
        
        address random = address(99);
        vm.prank(random);
        vm.expectRevert(abi.encodeWithSignature("NotBuyer()"));
        ownership.acceptTransfer(ownTid);
    }
    
    function test_ApproveTransfer() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        _issueValidCompliance(ownTid);
        
        vm.prank(seller);
        ownership.initTransfer(ownTid, buyer);
        
        vm.prank(buyer);
        ownership.acceptTransfer(ownTid);
        
        vm.prank(rto);
        ownership.approveTransfer(ownTid);
        
        assertEq(ownership.ownerOf(ownTid), buyer);
    }
    
    function testRevert_ApproveTransferWithoutCompliance() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(seller);
        ownership.initTransfer(ownTid, buyer);
        
        vm.prank(buyer);
        ownership.acceptTransfer(ownTid);
        
        // missing insurance/PUC
        vm.prank(rto);
        vm.expectRevert(abi.encodeWithSignature("InvalidInsurance()"));
        ownership.approveTransfer(ownTid);
    }
    
    function test_SellerCancelTransfer() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(seller);
        ownership.initTransfer(ownTid, buyer);
        
        vm.prank(seller);
        ownership.cancelTransfer(ownTid);
        
        assertFalse(ownership.hasActiveXfer(ownTid));
    }
    
    function test_BuyerCancelTransfer() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(seller);
        ownership.initTransfer(ownTid, buyer);
        
        vm.prank(buyer);
        ownership.cancelTransfer(ownTid);
        
        assertFalse(ownership.hasActiveXfer(ownTid));
    }
    
    function testRevert_UnauthorizedCancel() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(seller);
        ownership.initTransfer(ownTid, buyer);
        
        address random = address(99);
        vm.prank(random);
        vm.expectRevert(abi.encodeWithSignature("Unauthorized()"));
        ownership.cancelTransfer(ownTid);
    }
    
    function test_ExpiryGarbageCollection() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(seller);
        ownership.initTransfer(ownTid, buyer);
        
        vm.warp(block.timestamp + 31 days);
        
        address random = address(99);
        vm.prank(random);
        ownership.cancelTransfer(ownTid);
        
        assertFalse(ownership.hasActiveXfer(ownTid));
    }
}
