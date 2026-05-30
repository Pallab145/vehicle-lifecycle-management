// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/DigitalVehiclePassport.sol";
import "../src/OwnershipToken.sol";
import "../src/InsuranceToken.sol";
import "../src/PUCToken.sol";
import "../src/LoanContract.sol";
import "../src/ChallanContract.sol";
import "../src/IVehicleContracts.sol";

contract VehicleSystemTest is Test {
    DigitalVehiclePassport dvp;
    OwnershipToken ownership;
    InsuranceToken insurance;
    PUCToken puc;
    LoanContract loan;
    ChallanContract challan;
    
    address admin = address(1);
    address mfg = address(2);
    address rto = address(3);
    address insurer = address(4);
    address police = address(5);
    address bank = address(6);
    address pucCenter = address(7);
    address dealer = address(8);
    
    address seller = address(10);
    address buyer = address(11);
    
    function setUp() public {
        vm.startPrank(admin);
        
        // 1. Deploy contracts
        dvp = new DigitalVehiclePassport();
        ownership = new OwnershipToken(address(dvp));
        insurance = new InsuranceToken();
        puc = new PUCToken();
        loan = new LoanContract(address(dvp));
        challan = new ChallanContract();
        
        // 2. Link contracts
        ownership.setContracts(address(insurance), address(puc), address(loan), address(challan));
        dvp.setOwnershipContract(address(ownership));
        challan.setOwnershipContract(address(ownership));
        loan.setOwnershipContract(address(ownership));
        insurance.setOwnershipContract(address(ownership));
        puc.setOwnershipContract(address(ownership));
        
        // 3. Register Entities & Grant Roles
        dvp.regMfg("MFG01", mfg);
        ownership.regRTO("RTO01", rto);
        insurance.regIns("INS01", insurer);
        challan.regPolice("POL01", police);
        loan.regBank("BNK01", bank);
        puc.regCenter("PUC01", pucCenter);
        
        // 4. Grant SYSTEM_ROLE permissions
        ownership.grantRole(ownership.SYSTEM_ROLE(), address(dvp));
        insurance.grantRole(insurance.SYSTEM_ROLE(), address(dvp));
        puc.grantRole(puc.SYSTEM_ROLE(), address(dvp));
        challan.grantRole(challan.SYSTEM_ROLE(), address(dvp));
        
        ownership.grantRole(ownership.SYSTEM_ROLE(), address(loan));
        loan.grantRole(loan.SYSTEM_ROLE(), address(ownership));
        
        vm.stopPrank();
    }
    
    // Core setup helper to get a vehicle properly registered via dealer
    function _createAndRegisterVehicle() internal returns (uint256 dvpId, uint256 ownTid) {
        // 1. Mint DVP
        vm.prank(mfg);
        dvpId = dvp.manufacture(
            bytes32("VIN123"), bytes32("SPEC123"), bytes32("ENG123"), bytes32("CHA123")
        );
        
        // 2. Manufacturer assigns vehicle to dealer
        vm.prank(mfg);
        dvp.assignToDealer(dvpId, dealer);
        
        // 3. RTO issues Trade Certificate to dealer (valid for 30 days)
        vm.prank(rto);
        ownership.issueTradeCert(dealer, uint32(block.timestamp + 30 days));
        
        // 4. RTO Registers Ownership (Requires valid dealer and assignment)
        vm.prank(rto);
        ownTid = ownership.register(dvpId, seller, dealer);
        
        return (dvpId, ownTid);
    }
    
    function _issueValidCompliance(uint256 ownTid) internal {
        vm.prank(insurer);
        insurance.issuePolicy(ownTid, uint32(block.timestamp + 365 days), 50000, 1000);
        
        vm.prank(pucCenter);
        puc.issuePUC(ownTid, uint32(block.timestamp + 180 days), 10, 10, 10, true);
    }
    
    // ========================================================================
    // HAPPY PATH TESTS
    // ========================================================================
    
    function testManufacturingAndDealerAssignment() public {
        vm.startPrank(mfg);
        uint256 dvpId = dvp.manufacture(
            bytes32("VIN123"), bytes32("SPEC123"), bytes32("ENG123"), bytes32("CHA123")
        );
        dvp.assignToDealer(dvpId, dealer);
        vm.stopPrank();
        
        assertEq(dvp.getAssignedDealer(dvpId), dealer);
    }
    
    function testTradeCertAndRegistration() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        assertEq(ownership.ownerOf(ownTid), seller);
        assertTrue(ownership.isActive(ownTid));
    }
    
    function testHappyPathTransfer() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        _issueValidCompliance(ownTid); // Must have valid compliance to transfer
        
        // 1. Seller Initiates
        vm.prank(seller);
        ownership.initTransfer(ownTid, buyer);
        assertTrue(ownership.hasActiveXfer(ownTid));
        
        // 2. Buyer Accepts
        vm.prank(buyer);
        ownership.acceptTransfer(ownTid);
        
        // 3. RTO Approves
        vm.prank(rto);
        ownership.approveTransfer(ownTid);
        
        // Verify Transfer
        assertEq(ownership.ownerOf(ownTid), buyer);
        assertFalse(ownership.hasActiveXfer(ownTid));
    }
    
    // ========================================================================
    // CANCELLATION FLOW TESTS
    // ========================================================================
    
    function testSellerCancellation() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(seller);
        ownership.initTransfer(ownTid, buyer);
        
        // Seller cancels before buyer accepts
        vm.prank(seller);
        ownership.cancelTransfer(ownTid);
        
        assertFalse(ownership.hasActiveXfer(ownTid));
    }
    
    function testBuyerRejection() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(seller);
        ownership.initTransfer(ownTid, buyer);
        
        // Buyer rejects
        vm.prank(buyer);
        ownership.cancelTransfer(ownTid);
        
        assertFalse(ownership.hasActiveXfer(ownTid));
    }
    
    function testTransferExpiry() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(seller);
        ownership.initTransfer(ownTid, buyer);
        
        // Fast forward 31 days
        vm.warp(block.timestamp + 31 days);
        
        // Random person cancels
        address stranger = address(99);
        vm.prank(stranger);
        ownership.cancelTransfer(ownTid);
        
        assertFalse(ownership.hasActiveXfer(ownTid));
    }
    
    // ========================================================================
    // COMPLIANCE BLOCKING TESTS
    // ========================================================================
    
    function testTransferBlockedByChallan() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        _issueValidCompliance(ownTid);
        
        // Police issues challan
        vm.prank(police);
        challan.issueChallan(ownTid, 100);
        
        vm.prank(seller);
        ownership.initTransfer(ownTid, buyer);
        
        vm.prank(buyer);
        ownership.acceptTransfer(ownTid);
        
        // RTO tries to approve, but fails due to challan
        vm.prank(rto);
        vm.expectRevert(abi.encodeWithSignature("PendingChallansExist()"));
        ownership.approveTransfer(ownTid);
    }
    
    function testTransferBlockedByLoan() public {
        (uint256 dvpId, uint256 ownTid) = _createAndRegisterVehicle();
        _issueValidCompliance(ownTid);
        
        // Bank registers a loan
        vm.prank(bank);
        loan.registerLoan(dvpId, seller, 10000, 24);
        
        vm.prank(seller);
        ownership.initTransfer(ownTid, buyer);
        
        vm.prank(buyer);
        ownership.acceptTransfer(ownTid);
        
        // RTO tries to approve, but fails due to active loan
        vm.prank(rto);
        vm.expectRevert(abi.encodeWithSignature("ActiveLoanExists()"));
        ownership.approveTransfer(ownTid);
    }
    
    function testTransferBlockedByExpiredInsurance() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        // Issue insurance that expires in 1 day
        vm.prank(insurer);
        insurance.issuePolicy(ownTid, uint32(block.timestamp + 1 days), 50000, 1000);
        
        // Issue valid PUC
        vm.prank(pucCenter);
        puc.issuePUC(ownTid, uint32(block.timestamp + 180 days), 10, 10, 10, true);
        
        // Fast forward 2 days (Insurance is now expired)
        vm.warp(block.timestamp + 2 days);
        
        vm.prank(seller);
        ownership.initTransfer(ownTid, buyer);
        
        vm.prank(buyer);
        ownership.acceptTransfer(ownTid);
        
        // RTO tries to approve, but fails due to expired insurance
        vm.prank(rto);
        vm.expectRevert(abi.encodeWithSignature("InvalidInsurance()"));
        ownership.approveTransfer(ownTid);
    }
    
    function testTransferBlockedByExpiredPUC() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        // Issue valid insurance
        vm.prank(insurer);
        insurance.issuePolicy(ownTid, uint32(block.timestamp + 365 days), 50000, 1000);
        
        // Issue PUC that expires in 1 day
        vm.prank(pucCenter);
        puc.issuePUC(ownTid, uint32(block.timestamp + 1 days), 10, 10, 10, true);
        
        // Fast forward 2 days (PUC is now expired)
        vm.warp(block.timestamp + 2 days);
        
        vm.prank(seller);
        ownership.initTransfer(ownTid, buyer);
        
        vm.prank(buyer);
        ownership.acceptTransfer(ownTid);
        
        // RTO tries to approve, but fails due to expired PUC
        vm.prank(rto);
        vm.expectRevert(abi.encodeWithSignature("InvalidPUC()"));
        ownership.approveTransfer(ownTid);
    }
    
    function testInvalidDealerRegistration() public {
        // 1. Mint DVP
        vm.prank(mfg);
        uint256 dvpId = dvp.manufacture(
            bytes32("VIN123"), bytes32("SPEC123"), bytes32("ENG123"), bytes32("CHA123")
        );
        
        // 2. Manufacturer assigns vehicle to dealer A
        vm.prank(mfg);
        dvp.assignToDealer(dvpId, dealer);
        
        // 3. RTO issues Trade Certificate to dealer B (Rogue dealer)
        address rogueDealer = address(9);
        vm.prank(rto);
        ownership.issueTradeCert(rogueDealer, uint32(block.timestamp + 30 days));
        
        // 4. RTO Attempts to register via Rogue dealer (should fail)
        vm.prank(rto);
        vm.expectRevert(abi.encodeWithSignature("DealerMismatch()"));
        ownership.register(dvpId, seller, rogueDealer);
    }
}
