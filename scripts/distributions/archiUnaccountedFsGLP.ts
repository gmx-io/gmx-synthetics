import { ethers } from "hardhat";

// npx hardhat run --network arbitrum scripts/distributions/archiUnaccountedFsGLP.ts

/**
 * Traces all fsGLP transfers to/from CreditAggregator contract
 * CreditAggregator holds 99.81 fsGLP
 * tokens received via borrowing and was initiated by Archi Deployer
 * Transaction initiated on Feb-2023, which was before main archi contracts were deployed (Apr-2023)
 * Seems this was a transaction to test the archi system
 */

const FSGLP_ADDRESS = "0x1aDDD80E6039594eE970E5872D247bf0414C8903";
const CREDIT_AGGREGATOR = "0x437a182b571390c7e5d14cc7103d3b9d7628faca"; // holds 99.81 fsGLP
//

const ERC20_ABI = [
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "function balanceOf(address) view returns (uint256)",
];

async function main() {
  console.log("\n" + "=".repeat(80));
  console.log("TRACE fsGLP TRANSFERS - CreditAggregator");
  console.log("=".repeat(80) + "\n");

  const [signer] = await ethers.getSigners();
  const provider = signer.provider!;
  const currentBlock = await provider.getBlockNumber();

  const fsGLP = new ethers.Contract(FSGLP_ADDRESS, ERC20_ABI, provider);

  console.log(`Target Address: ${CREDIT_AGGREGATOR}`);
  console.log(`fsGLP Token: ${FSGLP_ADDRESS}`);
  console.log(`Current Block: ${currentBlock}\n`);

  // Get current balance
  const currentBalance = await fsGLP.balanceOf(CREDIT_AGGREGATOR);
  console.log(`Current Balance: ${ethers.utils.formatEther(currentBalance)} fsGLP\n`);

  console.log("=".repeat(80));
  console.log("QUERYING TRANSFER EVENTS");
  console.log("=".repeat(80) + "\n");

  // Query all transfers TO CreditAggregator
  console.log("Fetching transfers TO CreditAggregator...");
  const transfersIn = await fsGLP.queryFilter(
    fsGLP.filters.Transfer(null, CREDIT_AGGREGATOR),
    0, // From genesis
    currentBlock
  );
  console.log(`  Found ${transfersIn.length} incoming transfers\n`);

  // Query all transfers FROM CreditAggregator
  console.log("Fetching transfers FROM CreditAggregator...");
  const transfersOut = await fsGLP.queryFilter(
    fsGLP.filters.Transfer(CREDIT_AGGREGATOR, null),
    0, // From genesis
    currentBlock
  );
  console.log(`  Found ${transfersOut.length} outgoing transfers\n`);

  console.log("=".repeat(80));
  console.log("INCOMING TRANSFERS");
  console.log("=".repeat(80) + "\n");

  let totalIn = ethers.BigNumber.from(0);

  if (transfersIn.length === 0) {
    console.log("  No incoming transfers found.\n");
  } else {
    for (const event of transfersIn) {
      const from = event.args!.from;
      const value = event.args!.value;
      const block = event.blockNumber;
      const tx = event.transactionHash;

      totalIn = totalIn.add(value);

      console.log(`Block ${block}:`);
      console.log(`  From:   ${from}`);
      console.log(`  Amount: ${ethers.utils.formatEther(value)} fsGLP`);
      console.log(`  Tx:     ${tx}\n`);
    }
  }

  console.log("=".repeat(80));
  console.log("OUTGOING TRANSFERS");
  console.log("=".repeat(80) + "\n");

  let totalOut = ethers.BigNumber.from(0);

  if (transfersOut.length === 0) {
    console.log("  No outgoing transfers found.\n");
  } else {
    for (const event of transfersOut) {
      const to = event.args!.to;
      const value = event.args!.value;
      const block = event.blockNumber;
      const tx = event.transactionHash;

      totalOut = totalOut.add(value);

      console.log(`Block ${block}:`);
      console.log(`  To:     ${to}`);
      console.log(`  Amount: ${ethers.utils.formatEther(value)} fsGLP`);
      console.log(`  Tx:     ${tx}\n`);
    }
  }

  console.log("=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80) + "\n");

  const expectedBalance = totalIn.sub(totalOut);
  const difference = currentBalance.sub(expectedBalance);

  console.log(`Total Incoming:     ${ethers.utils.formatEther(totalIn)} fsGLP`);
  console.log(`Total Outgoing:     ${ethers.utils.formatEther(totalOut)} fsGLP`);
  console.log(`Expected Balance:   ${ethers.utils.formatEther(expectedBalance)} fsGLP`);
  console.log(`Actual Balance:     ${ethers.utils.formatEther(currentBalance)} fsGLP`);
  console.log(`Difference:         ${ethers.utils.formatEther(difference)} fsGLP\n`);

  if (difference.isZero()) {
    console.log("✅ Balance matches! All transfers accounted for.\n");
  } else {
    console.log("⚠️  Warning: Balance mismatch! Possible reasons:");
    console.log("   - Minting events (not transfers)");
    console.log("   - Burning events (not transfers)");
    console.log("   - Events before block 0\n");
  }

  console.log("=".repeat(80) + "\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
