const fs = require('fs');
const path = require('path');

// The core contracts we want to extract ABIs for
const CORE_CONTRACTS = [
    'DigitalVehiclePassport',
    'OwnershipToken',
    'InsuranceToken',
    'LoanContract',
    'PUCToken',
    'ChallanContract'
];

const OUT_DIR = path.join(__dirname, 'out');
const ABI_DIR = path.join(__dirname, 'abi');

async function extractABIs() {
    console.log("==========================================");
    console.log("🔄 Starting ABI Extraction Process");
    console.log("==========================================\n");

    // 1. Create the abi/ folder if it doesn't exist
    if (!fs.existsSync(ABI_DIR)) {
        fs.mkdirSync(ABI_DIR);
        console.log(`✅ Created ABI directory at: ${ABI_DIR}`);
    }

    let successCount = 0;

    // 2. Loop through our core contracts and extract them
    for (const contractName of CORE_CONTRACTS) {
        const sourceJsonPath = path.join(OUT_DIR, `${contractName}.sol`, `${contractName}.json`);
        const targetAbiPath = path.join(ABI_DIR, `${contractName}.json`);

        try {
            // Check if the compiled artifact exists
            if (!fs.existsSync(sourceJsonPath)) {
                console.warn(`⚠️ Warning: Could not find compiled artifact for ${contractName}. Did you run 'forge build'?`);
                continue;
            }

            // Read and parse the Foundry artifact
            const artifactRaw = fs.readFileSync(sourceJsonPath, 'utf8');
            const artifact = JSON.parse(artifactRaw);

            // Ensure the ABI exists in the artifact
            if (!artifact.abi) {
                console.warn(`⚠️ Warning: No ABI found in ${contractName}.json`);
                continue;
            }

            // Write ONLY the ABI array to the new file
            fs.writeFileSync(targetAbiPath, JSON.stringify(artifact.abi, null, 2));
            console.log(`✅ Extracted ABI for: ${contractName} -> abi/${contractName}.json`);
            successCount++;

        } catch (error) {
            console.error(`❌ Error processing ${contractName}:`, error.message);
        }
    }

    console.log("\n==========================================");
    console.log(`🎉 Successfully extracted ${successCount}/${CORE_CONTRACTS.length} ABIs into the 'abi/' folder!`);
    console.log("==========================================");
}

// Execute the function
extractABIs();
