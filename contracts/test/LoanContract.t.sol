// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./BaseSetup.t.sol";

contract LoanContractTest is BaseSetup {
    
    // ========================================================================
    // SETUP UTILS
    // ========================================================================
    
    function _setupActiveTransfer(uint256 ownTid) internal {
        _issueValidCompliance(ownTid);
        
        vm.prank(seller);
        ownership.initTransfer(ownTid, buyer);
        
        vm.prank(buyer);
        ownership.acceptTransfer(ownTid);
    }

    function _createUnregisteredDVP() internal returns (uint256 dvpId) {
        vm.prank(mfg);
        dvpId = dvp.manufacture(bytes32("VIN123"), bytes32("SPEC"), bytes32("ENG"), bytes32("CHA"));
        
        vm.prank(mfg);
        dvp.assignToDealer(dvpId, dealer);
        
        vm.prank(rto);
        ownership.issueTradeCert(dealer, uint32(block.timestamp + 30 days));
        return dvpId;
    }
    
    // ========================================================================
    // BRAND NEW CAR LOAN FLOW
    // ========================================================================
    
    function test_RegisterLoan_BrandNewCar() public {
        uint256 dvpId = _createUnregisteredDVP();
        
        // 1. Bank B issues loan on the unregistered DVP
        vm.prank(bank);
        loan.registerLoan(dvpId, buyer, 90000, 60);
        
        assertTrue(loan.hasActiveLoan(dvpId));
        assertEq(loan.getLoanBorrower(dvpId), buyer);
        
        // 2. Dealer registers the car to the correct buyer
        vm.prank(rto);
        ownership.register(dvpId, buyer, dealer);
        
        // Registration succeeds because buyer matches the loan borrower!
        uint256 ownTid = ownership.dvpToOwn(dvpId);
        assertEq(ownership.ownerOf(ownTid), buyer);
    }
    
    function testRevert_DealerFraud_WrongBuyer() public {
        uint256 dvpId = _createUnregisteredDVP();
        
        // 1. Bank B issues loan on the unregistered DVP for `buyer`
        vm.prank(bank);
        loan.registerLoan(dvpId, buyer, 90000, 60);
        
        // 2. Fraudulent Dealer tries to register the car to a `random` person
        address random = address(0xDEAD);
        
        vm.prank(rto);
        vm.expectRevert(abi.encodeWithSignature("LoanBorrowerMismatch()"));
        ownership.register(dvpId, random, dealer);
    }

    function test_BankCancelsLoanBeforeRegistration() public {
        uint256 dvpId = _createUnregisteredDVP();
        
        // 1. Bank issues loan
        vm.prank(bank);
        loan.registerLoan(dvpId, buyer, 90000, 60);
        
        // 2. Deal falls through. Bank issues NOC (clears loan)
        vm.prank(bank);
        loan.issueNOC(dvpId);
        
        assertFalse(loan.hasActiveLoan(dvpId));
        assertTrue(loan.isLoanCleared(dvpId));

        // Note: No NOC NFT is minted because it's not registered yet
    }
    
    // ========================================================================
    // USED CAR TRANSFER FLOW
    // ========================================================================
    
    function test_RegisterLoan_UsedCarTransfer() public {
        // 1. Register a car with Bank A loan
        uint256 dvpId = _createUnregisteredDVP();
        vm.prank(bank); // Bank A
        loan.registerLoan(dvpId, seller, 50000, 36);
        
        vm.prank(rto);
        uint256 ownTid = ownership.register(dvpId, seller, dealer);
        
        // 2. Seller initiates transfer to Buyer
        _setupActiveTransfer(ownTid);
        
        // 3. Bank B (bank2) registers loan for Buyer
        vm.prank(bank2);
        uint64 res = loan.registerLoan(dvpId, buyer, 80000, 48);
        assertEq(res, 0); // Returns 0 because it's pending, not active yet!
        
        // Active loan is STILL Bank A
        assertEq(loan.getLoanBorrower(dvpId), seller);
        
        // 4. Bank B wires fiat. Bank A issues NOC
        vm.prank(bank);
        loan.issueNOC(dvpId);
        
        // 5. RTO approves transfer
        vm.prank(rto);
        ownership.approveTransfer(ownTid);
        
        // 6. Verify transfer success and Bank B loan activation
        assertEq(ownership.ownerOf(ownTid), buyer);
        
        assertTrue(loan.hasActiveLoan(dvpId));
        assertEq(loan.getLoanBorrower(dvpId), buyer); // Bank B's borrower!
    }

    function testRevert_PendingLoan_WrongBuyer() public {
        uint256 dvpId = _createUnregisteredDVP();
        vm.prank(rto);
        uint256 ownTid = ownership.register(dvpId, seller, dealer);
        
        _setupActiveTransfer(ownTid); // Seller -> Buyer
        
        // Bank tries to register loan for someone else!
        address random = address(0xBEEF);
        
        vm.prank(bank2);
        vm.expectRevert(abi.encodeWithSignature("InvalidBuyer()"));
        loan.registerLoan(dvpId, random, 80000, 48);
    }
    
    function test_RefinanceLoan() public {
        uint256 dvpId = _createUnregisteredDVP();
        vm.prank(bank);
        uint64 oldLoanId = loan.registerLoan(dvpId, seller, 50000, 36);
        
        vm.prank(rto);
        ownership.register(dvpId, seller, dealer);
        
        vm.warp(block.timestamp + 365 days);
        
        vm.prank(bank);
        uint64 newLoanId = loan.refinanceLoan(dvpId, 40000, 24);
        
        assertFalse(loan.getLoan(oldLoanId).active);
        assertTrue(loan.getLoan(newLoanId).active);
        assertEq(loan.getLoan(newLoanId).amount, 40000);
    }
    
    function test_BankCancelsPendingLoan() public {
        uint256 dvpId = _createUnregisteredDVP();
        vm.prank(rto);
        uint256 ownTid = ownership.register(dvpId, seller, dealer);
        
        _setupActiveTransfer(ownTid); // Seller -> Buyer
        
        // Bank registers pending loan
        vm.prank(bank2);
        loan.registerLoan(dvpId, buyer, 80000, 48);
        
        // Verify it is attached
        OwnershipToken.Xfer memory req = ownership.getActiveXfer(ownTid);
        assertTrue(req.hasPendingLoan);
        assertEq(req.pendingBankId, loan.bankCode("BNK02"));
        
        // Bank cancels it
        vm.prank(bank2);
        loan.cancelPendingLoan(dvpId);
        
        // Verify it is detached
        OwnershipToken.Xfer memory reqAfter = ownership.getActiveXfer(ownTid);
        assertFalse(reqAfter.hasPendingLoan);
        assertEq(reqAfter.pendingBankId, 0);
    }
}
