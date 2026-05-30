// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/DigitalVehiclePassport.sol";
import "../src/OwnershipToken.sol";
import "../src/InsuranceToken.sol";
import "../src/LoanContract.sol";
import "../src/PUCToken.sol";
import "../src/ChallanContract.sol";

// Gnosis Safe — installed via: forge install safe-global/safe-smart-account --no-commit
import "@safe-global/safe-smart-account/contracts/Safe.sol";
import "@safe-global/safe-smart-account/contracts/proxies/SafeProxyFactory.sol";

/**
 * @title DeployVehicleSystem
 * @dev Complete deployment script for the Vehicle Management System
 *      with Gnosis Safe multi-sig governance handover.
 *
 * Deployment Order:
 *  1. DigitalVehiclePassport (DVP) — Core vehicle identity
 *  2. OwnershipToken             — Requires DVP address
 *  3. InsuranceToken             — Standalone
 *  4. LoanContract               — Requires DVP address
 *  5. PUCToken                   — Standalone
 *  6. ChallanContract            — Standalone
 *  7. Link compliance contracts into OwnershipToken
 *  8. Link OwnershipToken back to DVP, Challan, Insurance, PUC, Loan
 *  9. Wire SYSTEM_ROLE for cross-contract atomic calls
 * 10. Deploy Gnosis Safe (2-of-3 MoRTH multi-sig) inline
 * 11. Grant DEFAULT_ADMIN + ADMIN to Safe on all 6 contracts
 * 12. Deployer renounces DEFAULT_ADMIN + ADMIN on all 6 contracts
 *
 * Required environment variables:
 *   MORTH_ADMIN_1  — first MoRTH authority wallet address
 *   MORTH_ADMIN_2  — second MoRTH authority wallet address
 *   MORTH_ADMIN_3  — third MoRTH authority wallet address
 *
 * Usage:
 *   forge script script/Deploy.s.sol \
 *     --rpc-url $RPC_URL \
 *     --broadcast \
 *     --legacy
 */
contract DeployVehicleSystem is Script {

    // ── Vehicle System Contracts ─────────────────────────────────────────────
    DigitalVehiclePassport public dvp;
    OwnershipToken         public ownership;
    InsuranceToken         public insurance;
    LoanContract           public loan;
    PUCToken               public puc;
    ChallanContract        public challan;

    function run() external {
        // ── Load MoRTH authority wallets from environment ─────────────────────
        address MORTH_ADMIN_1 = vm.envAddress("MORTH_ADMIN_1");
        address MORTH_ADMIN_2 = vm.envAddress("MORTH_ADMIN_2");
        address MORTH_ADMIN_3 = vm.envAddress("MORTH_ADMIN_3");

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
        loan = new LoanContract(address(dvp));
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
        // STEP 8: Link OwnershipToken back to DVP and all secondary contracts
        // ====================================================================
        console2.log("\n=== Linking OwnershipToken to DVP and secondary contracts ===");
        dvp.setOwnershipContract(address(ownership));
        dvp.setComplianceContracts(address(loan), address(challan), address(insurance), address(puc));
        challan.setOwnershipContract(address(ownership));
        insurance.setOwnershipContract(address(ownership));
        puc.setOwnershipContract(address(ownership));
        loan.setOwnershipContract(address(ownership));
        console2.log("Reverse linkage completed successfully");

        // ====================================================================
        // STEP 9: Wire SYSTEM_ROLE for cross-contract atomic calls
        // DVP needs SYSTEM_ROLE on all 4 to terminate records on scrap.
        // OwnershipToken needs SYSTEM_ROLE on Loan for atomic loan activation.
        // ====================================================================
        console2.log("\n=== Granting SYSTEM_ROLE ===");
        bytes32 SYSTEM_ROLE = keccak256("SYSTEM");

        ownership.grantRole(SYSTEM_ROLE, address(dvp));
        insurance.grantRole(SYSTEM_ROLE, address(dvp));
        puc.grantRole(SYSTEM_ROLE, address(dvp));
        challan.grantRole(SYSTEM_ROLE, address(dvp));
        loan.grantRole(SYSTEM_ROLE, address(ownership));

        console2.log("SYSTEM_ROLE wired successfully");

        // ====================================================================
        // STEP 10: Deploy Gnosis Safe (2-of-3 MoRTH Multi-Sig)
        //
        // We deploy the Safe INLINE — no pre-deployed address required.
        // The Safe singleton + proxy factory are deployed fresh on this chain.
        // ====================================================================
        console2.log("\n=== Deploying Gnosis Safe Multi-Sig ===");

        // Deploy Safe infrastructure
        SafeProxyFactory factory   = new SafeProxyFactory();
        Safe             singleton = new Safe();

        // Build owner array
        address[] memory owners = new address[](3);
        owners[0] = MORTH_ADMIN_1;
        owners[1] = MORTH_ADMIN_2;
        owners[2] = MORTH_ADMIN_3;

        // Encode Safe.setup() — type-safe via abi.encodeCall
        // Parameters: owners, threshold, to, data, fallbackHandler,
        //             paymentToken, payment, paymentReceiver
        bytes memory initData = abi.encodeCall(
            Safe.setup,
            (
                owners,
                2,              // threshold: 2-of-3 MoRTH wallets must approve
                address(0),     // to: no delegate call during setup
                bytes(""),      // data: empty
                address(0),     // fallbackHandler: none
                address(0),     // paymentToken: native token (ETH/ETH-equivalent)
                0,              // payment: zero
                payable(address(0)) // paymentReceiver: none
            )
        );

        // Deploy the Safe proxy — nonce = chainId for chain-unique determinism
        address morthSafe = address(
            factory.createProxyWithNonce(address(singleton), initData, block.chainid)
        );

        console2.log("MoRTH Gnosis Safe deployed at:", morthSafe);
        console2.log("  Owners: MORTH_ADMIN_1, MORTH_ADMIN_2, MORTH_ADMIN_3");
        console2.log("  Threshold: 2-of-3");

        // ====================================================================
        // STEP 11: Grant admin roles to Gnosis Safe on ALL 6 contracts
        // ====================================================================
        console2.log("\n=== Granting Admin Roles to Gnosis Safe ===");
        bytes32 DEFAULT_ADMIN_ROLE = 0x00;
        bytes32 ADMIN_ROLE         = keccak256("ADMIN");

        dvp.grantRole(DEFAULT_ADMIN_ROLE, morthSafe);
        dvp.grantRole(ADMIN_ROLE,         morthSafe);

        ownership.grantRole(DEFAULT_ADMIN_ROLE, morthSafe);
        ownership.grantRole(ADMIN_ROLE,         morthSafe);

        insurance.grantRole(DEFAULT_ADMIN_ROLE, morthSafe);
        insurance.grantRole(ADMIN_ROLE,         morthSafe);

        loan.grantRole(DEFAULT_ADMIN_ROLE, morthSafe);
        loan.grantRole(ADMIN_ROLE,         morthSafe);

        puc.grantRole(DEFAULT_ADMIN_ROLE, morthSafe);
        puc.grantRole(ADMIN_ROLE,         morthSafe);

        challan.grantRole(DEFAULT_ADMIN_ROLE, morthSafe);
        challan.grantRole(ADMIN_ROLE,         morthSafe);

        console2.log("Admin roles granted to Gnosis Safe on all 6 contracts");

        // ====================================================================
        // STEP 12: Deployer renounces ALL admin access — permanently
        //
        // After this point the deployer key has ZERO access to any contract.
        // All future admin actions require 2-of-3 MoRTH signatures through
        // the Gnosis Safe at app.safe.global.
        // ====================================================================
        console2.log("\n=== Deployer Renouncing Admin Roles ===");

        dvp.renounceRole(DEFAULT_ADMIN_ROLE, msg.sender);
        dvp.renounceRole(ADMIN_ROLE,         msg.sender);

        ownership.renounceRole(DEFAULT_ADMIN_ROLE, msg.sender);
        ownership.renounceRole(ADMIN_ROLE,         msg.sender);

        insurance.renounceRole(DEFAULT_ADMIN_ROLE, msg.sender);
        insurance.renounceRole(ADMIN_ROLE,         msg.sender);

        loan.renounceRole(DEFAULT_ADMIN_ROLE, msg.sender);
        loan.renounceRole(ADMIN_ROLE,         msg.sender);

        puc.renounceRole(DEFAULT_ADMIN_ROLE, msg.sender);
        puc.renounceRole(ADMIN_ROLE,         msg.sender);

        challan.renounceRole(DEFAULT_ADMIN_ROLE, msg.sender);
        challan.renounceRole(ADMIN_ROLE,         msg.sender);

        console2.log("Deployer has renounced all admin roles. Governance is now with MoRTH Safe.");

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
        console2.log("-------------------------------------------------");
        console2.log("MoRTH Gnosis Safe:     ", morthSafe);
        console2.log("  Threshold: 2-of-3");
        console2.log("  Owner 1:  ", MORTH_ADMIN_1);
        console2.log("  Owner 2:  ", MORTH_ADMIN_2);
        console2.log("  Owner 3:  ", MORTH_ADMIN_3);
        console2.log("=================================================");
        console2.log("Deployer access: FULLY REVOKED");
        console2.log("Governance: MoRTH Gnosis Safe (2-of-3)");
        console2.log("=================================================");
        console2.log("\nAll contracts deployed successfully!");
    }
}