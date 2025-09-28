import hre from "hardhat";
import { setTimeout as delay } from "timers/promises";

// npx hardhat --config hardhat.config.tenderly.ts run scripts/verifyTenderly.ts --network <network>

async function main() {
  const network = hre.network.name;
  console.log(`\nStarting Tenderly verification for network: ${network}`);
  console.log(`Loading deployed contracts from hardhat-deploy...`);

  // Get all deployed contracts from hardhat-deploy
  const deployments = await hre.deployments.all();
  const contractNames = Object.keys(deployments);

  console.log(`\nFound ${contractNames.length} contracts to verify`);

  let verified = 0;
  let failed = 0;
  const failedContracts: string[] = [];

  for (let i = 0; i < contractNames.length; i++) {
    const name = contractNames[i];
    const deployment = deployments[name];

    console.log(`\n[${i + 1}/${contractNames.length}] Verifying ${name}...`);
    console.log(`  Address: ${deployment.address}`);

    try {
      // Prepare verification parameters
      const verifyParams: any = {
        name: name,
        address: deployment.address,
      };

      // Add constructor arguments if they exist
      if (deployment.args && deployment.args.length > 0) {
        verifyParams.constructorArguments = deployment.args;
      }

      // Add libraries if they exist
      if (deployment.libraries && Object.keys(deployment.libraries).length > 0) {
        verifyParams.libraries = deployment.libraries;
      }

      // Verify the contract on Tenderly
      await hre.tenderly.verify(verifyParams);

      console.log(`  ✅ Successfully verified ${name}`);
      verified++;

      // Small delay to avoid rate limiting
      await delay(500);
    } catch (error: any) {
      console.log(`  ❌ Failed to verify ${name}`);

      // Check for specific error types
      if (error.message?.includes("already verified")) {
        console.log(`     ℹ️  Contract already verified on Tenderly`);
        verified++;
      } else if (error.message?.includes("rate limit")) {
        console.log(`     ⚠️  Rate limit reached, waiting 5 seconds...`);
        await delay(5000);
        i--; // Retry this contract
      } else {
        console.log(`     Error: ${error.message || error}`);
        failed++;
        failedContracts.push(name);
      }
    }
  }

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("VERIFICATION SUMMARY");
  console.log("=".repeat(60));
  console.log(`✅ Successfully verified: ${verified} contracts`);
  console.log(`❌ Failed to verify: ${failed} contracts`);

  if (failedContracts.length > 0) {
    console.log("\n⚠️  Failed contracts:");
    failedContracts.forEach((name) => {
      const addr = deployments[name].address;
      console.log(`   - ${name} (${addr})`);
    });
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Fatal error during verification:", error);
    process.exit(1);
  });
