import hre from "hardhat";
import prompts from "prompts";
import { ethers } from "ethers";

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

async function main() {
  const tokenAddress = process.env.TOKEN;
  const amountStr = process.env.AMOUNT;
  const receiver = process.env.RECEIVER;

  if (!tokenAddress) {
    throw new Error("TOKEN is empty");
  }

  if (!amountStr) {
    throw new Error("AMOUNT is empty");
  }

  if (!receiver) {
    throw new Error("RECEIVER is empty");
  }

  const [signer] = await hre.ethers.getSigners();
  // Get the token contract
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);

  // Get token details
  const symbol = await token.symbol();
  const decimals = await token.decimals();

  // Parse amount
  const amount = ethers.utils.parseUnits(amountStr, decimals);

  const balance = await token.balanceOf(signer.address);

  console.info(`Sender: ${signer.address}`);
  console.info(`Receiver: ${receiver}`);
  console.info(`Balance: ${ethers.utils.formatUnits(balance, decimals)} ${symbol}`);
  console.info(`Transferring ${amountStr} ${symbol} (${amount.toString()}) to ${receiver}`);

  if (balance.lt(amount)) {
    throw new Error("Insufficient balance");
  }

  const { write } = await prompts({
    type: "confirm",
    name: "write",
    message: "Do you want to execute the transaction?",
  });

  if (write) {
    const tx = await token.transfer(receiver, amount);
    console.log(`Transfer tx sent: ${tx.hash}`);
    await tx.wait();
    console.log(`Transfer completed`);

    const newBalance = await token.balanceOf(signer.address);
    console.log(`New balance: ${ethers.utils.formatUnits(newBalance, decimals)} ${symbol}`);
  } else {
    console.log("NOTE: executed in read-only mode, no transaction was sent");
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
