// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/DigitalVehiclePassport.sol";
import "../src/OwnershipToken.sol";
import "../src/InsuranceToken.sol";
import "../src/PUCToken.sol";
import "../src/LoanContract.sol";
import "../src/ChallanContract.sol";

abstract contract BaseSetup is Test {
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
    
    function setUp() public virtual {
        vm.startPrank(admin);
        
        // 1. Deploy contracts
        dvp = new DigitalVehiclePassport();
        ownership = new OwnershipToken(address(dvp));
        insurance = new InsuranceToken();
        puc = new PUCToken();
        loan = new LoanContract();
        challan = new ChallanContract();
        
        // 2. Link contracts
        ownership.setContracts(address(insurance), address(puc), address(loan), address(challan));
        dvp.setOwnershipContract(address(ownership));
        challan.setOwnershipContract(address(ownership));
        
        // 3. Register Entities & Grant Roles
        dvp.regMfg("MFG01", mfg);
        ownership.regRTO("RTO01", rto);
        insurance.regIns("INS01", insurer);
        challan.regPolice("POL01", police);
        loan.regBank("BNK01", bank);
        puc.regCenter("PUC01", pucCenter);
        
        vm.stopPrank();
    }
    
    // Core helper to get a vehicle properly registered via dealer
    function _createAndRegisterVehicle() internal returns (uint256 dvpId, uint256 ownTid) {
        vm.prank(mfg);
        dvpId = dvp.manufacture(
            bytes32("VIN123"), bytes32("SPEC123"), bytes32("ENG123"), bytes32("CHA123")
        );
        
        vm.prank(mfg);
        dvp.assignToDealer(dvpId, dealer);
        
        vm.prank(rto);
        ownership.issueTradeCert(dealer, uint32(block.timestamp + 30 days));
        
        vm.prank(rto);
        ownTid = ownership.register(dvpId, seller, dealer);
        
        return (dvpId, ownTid);
    }
    
    // Core helper to issue valid compliance documents
    function _issueValidCompliance(uint256 ownTid) internal {
        vm.prank(insurer);
        insurance.issuePolicy(ownTid, seller, uint32(block.timestamp + 365 days), 50000, 1000);
        
        vm.prank(pucCenter);
        puc.issuePUC(ownTid, uint32(block.timestamp + 180 days), 10, 10, 10, true);
    }
}
