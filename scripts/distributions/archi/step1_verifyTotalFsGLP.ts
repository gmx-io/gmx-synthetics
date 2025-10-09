import { ethers } from "hardhat";

// npx hardhat run --network arbitrum scripts/distributions/archi/step1_verifyTotalFsGLP.ts

/**
 * STEP 1: Verify Total fsGLP Holdings
 *
 * Dune query archi-contracts-fsGLP-balances.sql --> https://dune.com/queries/5781806
 * finds all Archi deployed contracts holding GLP
 * And the 3 contracts bellow held fsGLP at the time of incident
 */

const CONTRACTS = {
  GMXExecutor: "0x49ee14e37cb47bff8c512b3a0d672302a3446eb1",
  "CreditUser #2": "0xe854358Bc324Cd5a73DEb5552a698e462A9CC38E",
  CreditAggregator: "0x437a182b571390c7e5d14cc7103d3b9d7628faca", // unaccounted small amount (< 100 fsGLP)
};

const FSGLP_TOKEN = "0x1aDDD80E6039594eE970E5872D247bf0414C8903";

const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];

async function main() {
  console.log("\n" + "=".repeat(80));
  console.log("STEP 1: Verify Total fsGLP Holdings");
  console.log("=".repeat(80) + "\n");

  const [signer] = await ethers.getSigners();
  const provider = signer.provider!;

  const fsGLP = new ethers.Contract(FSGLP_TOKEN, ERC20_ABI, provider);

  let totalFsGLP = ethers.BigNumber.from(0);

  console.log("Checking fsGLP balances:\n");

  for (const [name, address] of Object.entries(CONTRACTS)) {
    const balance = await fsGLP.balanceOf(address);
    const formatted = ethers.utils.formatEther(balance);

    console.log(`${name}:`);
    console.log(`  Address: ${address}`);
    console.log(`  Balance: ${formatted} fsGLP\n`);

    totalFsGLP = totalFsGLP.add(balance);
  }

  console.log("=".repeat(80));
  console.log(`TOTAL fsGLP TO DISTRIBUTE: ${ethers.utils.formatEther(totalFsGLP)} fsGLP`);
  console.log("=".repeat(80) + "\n");

  console.log("Breakdown:");
  console.log("  - GMXExecutor: Holds farmer collateral + borrowed fsGLP");
  console.log("  - CreditUser #2: Holds reserved liquidator fees (goes to farmers)\n");

  console.log("Expected: ~1,615,173 fsGLP");
  console.log("  - GMXExecutor      (collateral + borrowed):   ~1,606,694 fsGLP");
  console.log("  - CreditUser #2    (reserved liquidator fees):    ~8,479 fsGLP");
  console.log("  - CreditAggregator (unaccounted for):               ~100 fsGLP\n");

  const totalFormatted = parseFloat(ethers.utils.formatEther(totalFsGLP));
  if (totalFormatted >= 1615000 && totalFormatted <= 1616000) {
    console.log("✅ VERIFIED: Total fsGLP matches expected amount\n");
  } else {
    console.log("⚠️  WARNING: Total fsGLP does not match expected amount\n");
  }

  console.log("Next step: Run step2_extractPositionData.ts to get farmer positions\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
