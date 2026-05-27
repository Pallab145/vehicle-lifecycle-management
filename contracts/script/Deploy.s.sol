// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/DigitalVehiclePassport.sol";
import "../src/OwnershipToken.sol";
import "../src/InsuranceToken.sol";
import "../src/LoanContract.sol";
import "../src/PUCToken.sol";
import "../src/ChallanContract.sol";

/**
 * @title DeployVehicleSystem
 * @dev Complete deployment script for the Vehicle Management System
 * 
 * Deployment Order:
 * 1. DigitalVehiclePassport (DVP) - Core vehicle identity
 * 2. OwnershipToken - Requires DVP address
 * 3. InsuranceToken - Standalone
 * 4. LoanContract - Standalone
 * 5. PUCToken - Standalone
 * 6. ChallanContract - Standalone
 * 7. Set contract references in OwnershipToken
 */
contract DeployVehicleSystem is Script {
    // Contract instances
    DigitalVehiclePassport public dvp;
    OwnershipToken public ownership;
    InsuranceToken public insurance;
    LoanContract public loan;
    PUCToken public puc;
    ChallanContract public challan;
    
    function run() external {
        // Load deployer private key from environment
        //uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        
        vm.startBroadcast();
        
        // ====================================================================
        // STEP 1: Deploy DigitalVehiclePassport (DVP)
        // ====================================================================
        console2.log("=== Deploying DigitalVehiclePassport ===");
        dvp = new DigitalVehiclePassport();
        console2.log("DigitalVehiclePassport deployed at:", address(dvp));
        
        // ====================================================================
        // STEP 2: Deploy OwnershipToken (requires DVP address)
        // ====================================================================
        console2.log("\n=== Deploying OwnershipToken ===");
        ownership = new OwnershipToken(address(dvp));
        console2.log("OwnershipToken deployed at:", address(ownership));
        
        // ====================================================================
        // STEP 3: Deploy InsuranceToken
        // ====================================================================
        console2.log("\n=== Deploying InsuranceToken ===");
        insurance = new InsuranceToken();
        console2.log("InsuranceToken deployed at:", address(insurance));
        
        // ====================================================================
        // STEP 4: Deploy LoanContract
        // ====================================================================
        console2.log("\n=== Deploying LoanContract ===");
        loan = new LoanContract();
        console2.log("LoanContract deployed at:", address(loan));
        
        // ====================================================================
        // STEP 5: Deploy PUCToken
        // ====================================================================
        console2.log("\n=== Deploying PUCToken ===");
        puc = new PUCToken();
        console2.log("PUCToken deployed at:", address(puc));
        
        // ====================================================================
        // STEP 6: Deploy ChallanContract
        // ====================================================================
        console2.log("\n=== Deploying ChallanContract ===");
        challan = new ChallanContract();
        console2.log("ChallanContract deployed at:", address(challan));
        
        // ====================================================================
        // STEP 7: Link contracts in OwnershipToken
        // ====================================================================
        console2.log("\n=== Linking Compliance Contracts to OwnershipToken ===");
        ownership.setContracts(
            address(insurance),
            address(puc),
            address(loan),
            address(challan)
        );
        console2.log("Compliance contracts linked to OwnershipToken");
        
        // ====================================================================
        // STEP 8: Link OwnershipToken back to DVP and Challan
        // ====================================================================
        console2.log("\n=== Linking OwnershipToken to DVP and Challan ===");
        dvp.setOwnershipContract(address(ownership));
        challan.setOwnershipContract(address(ownership));
        console2.log("Reverse linkage completed successfully");
        
        vm.stopBroadcast();
        
        // ====================================================================
        // DEPLOYMENT SUMMARY
        // ====================================================================
        console2.log("\n=================================================");
        console2.log("DEPLOYMENT SUMMARY");
        console2.log("=================================================");
        console2.log("DigitalVehiclePassport:", address(dvp));
        console2.log("OwnershipToken:        ", address(ownership));
        console2.log("InsuranceToken:        ", address(insurance));
        console2.log("LoanContract:          ", address(loan));
        console2.log("PUCToken:              ", address(puc));
        console2.log("ChallanContract:       ", address(challan));
        console2.log("=================================================");
        console2.log("\nAll contracts deployed successfully!");
        // console2.log("Deployer address:", vm.addr(deployerKey));
    }
}