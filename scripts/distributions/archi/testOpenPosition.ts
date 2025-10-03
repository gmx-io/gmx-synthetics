import { ethers } from "hardhat";

// npx hardhat run --network arbitrum scripts/distributions/archi/testOpenPosition.ts

const CREDIT_CALLER = "0xcEd4D9293002964fEA40F984c6d7e20c5eD49D35";
const GMX_DEPOSITOR = "0x7093c218188d101f5E121Ab679cA3b5e034F7863";
const WETH = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";

async function main() {
  const [signer] = await ethers.getSigners();

  console.log(`Signer: ${signer.address}`);
  console.log(`Testing position opening with 0.00001 WETH collateral + 1x leverage\n`);

  const weth = await ethers.getContractAt("IERC20", WETH);
  const creditCaller = await ethers.getContractAt(
    ["function openLendCredit(address,address,uint256,address[],uint256[],address) payable"],
    CREDIT_CALLER
  );

  const amount = ethers.utils.parseEther("0.00001");

  // Step 1: Approve
  console.log("1. Approving WETH...");
  const approveTx = await weth.approve(CREDIT_CALLER, amount);
  await approveTx.wait();
  console.log(`   ✅ Approved: ${approveTx.hash}\n`);

  // Step 2: Open position (force with manual gas limit)
  console.log("2. Opening position (forcing transaction)...");
  try {
    const tx = await creditCaller.openLendCredit(
      GMX_DEPOSITOR,
      WETH,
      amount,
      [WETH], // borrow WETH
      [100], // 1x leverage
      signer.address,
      {
        gasLimit: 5000000, // Force high gas limit to bypass estimation
      }
    );

    console.log(`   Transaction sent: ${tx.hash}`);
    console.log(`   View on Tenderly: https://dashboard.tenderly.co/tx/arbitrum/${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`   Status: ${receipt.status === 1 ? "✅ Success" : "❌ Failed"}\n`);
  } catch (error: any) {
    console.log("   ❌ Failed\n");

    if (error.receipt) {
      console.log(`Transaction hash: ${error.receipt.transactionHash}`);
      console.log(`View on Tenderly: https://dashboard.tenderly.co/tx/arbitrum/${error.receipt.transactionHash}\n`);
    }

    console.log("Error:", error.message);

    if (error.data) {
      console.log("\nRaw error data:", error.data);
    }

    if (error.message.includes("Vester")) {
      console.log("\n🔍 This is the GMX handleRewards() blocking issue");
      console.log("   See GMX_SHUTDOWN_SOLUTION.md for fix");
    }

    if (error.message.includes("whitelist") || error.message.includes("Allowlist")) {
      console.log("\n🔍 Your address needs to be whitelisted");
      console.log("   Allowlist contract: 0x9821fC145052b740273fFae362350b226dfbaB38");
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
