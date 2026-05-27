// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./BaseSetup.t.sol";

contract LoanContractTest is BaseSetup {
    
    function test_AdminCanRegisterBank() public {
        vm.prank(admin);
        loan.regBank("BNK02", address(22));
        assertEq(loan.bankCode("BNK02"), 2);
    }
    
    function testRevert_NonAdminCannotRegisterBank() public {
        vm.prank(seller);
        vm.expectRevert();
        loan.regBank("BNK02", address(22));
    }
    
    function test_BankCanRegisterLoan() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(bank);
        loan.registerLoan(ownTid, 10000, 24);
        
        assertFalse(loan.isLoanCleared(ownTid));
    }
    
    function testRevert_NonBankCannotRegisterLoan() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(seller);
        vm.expectRevert();
        loan.registerLoan(ownTid, 10000, 24);
    }
    
    function testRevert_CannotRegisterMultipleActiveLoans() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(bank);
        loan.registerLoan(ownTid, 10000, 24);
        
        vm.prank(bank);
        vm.expectRevert(abi.encodeWithSignature("LoanExists()"));
        loan.registerLoan(ownTid, 5000, 12);
    }
    
    function test_BankCanIssueNOC() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(bank);
        loan.registerLoan(ownTid, 10000, 24);
        
        vm.prank(bank);
        loan.issueNOC(ownTid, seller);
        
        assertTrue(loan.isLoanCleared(ownTid));
    }
    
    function testRevert_CannotIssueNOCForOtherBanksLoan() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(bank);
        loan.registerLoan(ownTid, 10000, 24);
        
        // Register second bank
        address bank2 = address(22);
        vm.prank(admin);
        loan.regBank("BNK02", bank2);
        
        vm.prank(bank2);
        vm.expectRevert(abi.encodeWithSignature("Unauthorized()"));
        loan.issueNOC(ownTid, seller);
    }
    
    function testRevert_CannotIssueNOCForClearedLoan() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(bank);
        loan.registerLoan(ownTid, 10000, 24);
        
        vm.prank(bank);
        loan.issueNOC(ownTid, seller);
        
        vm.prank(bank);
        vm.expectRevert(abi.encodeWithSignature("LoanNotFound()")); // Once NOC issued, loan.active is false
        loan.issueNOC(ownTid, seller);
    }
    
    function test_AdminCanToggleBankStatus() public {
        vm.prank(admin);
        loan.toggleBankStatus("BNK01");
        
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(bank);
        vm.expectRevert(abi.encodeWithSignature("BankNotActive()"));
        loan.registerLoan(ownTid, 10000, 24);
    }
    
    function test_CanRegisterNewLoanAfterNOC() public {
        (, uint256 ownTid) = _createAndRegisterVehicle();
        
        vm.prank(bank);
        loan.registerLoan(ownTid, 10000, 24);
        
        vm.prank(bank);
        loan.issueNOC(ownTid, seller);
        
        // Now register another loan
        vm.prank(bank);
        loan.registerLoan(ownTid, 5000, 12);
        
        assertFalse(loan.isLoanCleared(ownTid));
    }
}
