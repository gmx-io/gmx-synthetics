import { ethers } from "hardhat";

// npx hardhat run --network arbitrum scripts/distributions/archi/testAddLiquidity.ts

const WETH_ADDRESS = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";
const WETH_VAULT_ADDRESS = "0x7674Ccf6cAE51F20d376644C42cd69EC7d4324f4";

const WETH_ABI = ["function approve(address spender, uint256 amount) returns (bool)"];

const VAULT_ABI = ["function addLiquidity(uint256 _amountIn) payable returns (uint256)"];

async function main() {
  const [signer] = await ethers.getSigners();
  const amount = ethers.utils.parseEther("0.01"); // 0.01 WETH

  console.log(`Signer: ${signer.address}`);
  console.log(`Amount: ${ethers.utils.formatEther(amount)} WETH`);

  // Step 1: Approve
  const weth = new ethers.Contract(WETH_ADDRESS, WETH_ABI, signer);
  console.log("\nApproving WETH Vault...");
  const approveTx = await weth.approve(WETH_VAULT_ADDRESS, amount);
  await approveTx.wait();
  console.log(`Approved: ${approveTx.hash}`);

  // Step 2: Add Liquidity (force with manual gas limit)
  const vault = new ethers.Contract(WETH_VAULT_ADDRESS, VAULT_ABI, signer);
  console.log("\nAdding liquidity (forcing transaction)...");

  try {
    const addTx = await vault.addLiquidity(amount, {
      gasLimit: 3000000, // Force high gas limit to bypass estimation
    });
    console.log(`Transaction sent: ${addTx.hash}`);
    console.log(`View on Tenderly: https://dashboard.tenderly.co/tx/arbitrum/${addTx.hash}`);

    const receipt = await addTx.wait();
    console.log(`Status: ${receipt.status === 1 ? "✅ Success" : "❌ Failed"}`);
  } catch (error: any) {
    if (error.receipt) {
      console.log(`Transaction failed: ${error.receipt.transactionHash}`);
      console.log(`View on Tenderly: https://dashboard.tenderly.co/tx/arbitrum/${error.receipt.transactionHash}`);
    }
    throw error;
  }

  console.log("\n✅ Done!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
