import prompts from "prompts";
import hre from "hardhat";
import { bigNumberify, formatAmount } from "../../utils/math";

const tokenAddress = process.env.TOKEN;
let amount = process.env.AMOUNT ? bigNumberify(process.env.AMOUNT) : undefined;
const SAFE_ADDRESS = "0xD2E217d800C41c86De1e01FD72009d4Eafc539a3";

async function main() {
  if (hre.network.name !== "arbitrum") {
    throw new Error("only arbitrum is supported");
  }
  if (!tokenAddress) {
    throw new Error("TOKEN is required");
  }

  const tokenContract = await hre.ethers.getContractAt("MintableToken", tokenAddress);

  const [signer] = await hre.ethers.getSigners();
  const receiver = SAFE_ADDRESS;

  console.log("token %s", tokenAddress);
  console.log("receiver %s", receiver);

  const balance = await tokenContract.balanceOf(signer.address);
  console.log("balance is %s", formatAmount(balance, 18, 2, true));

  if (!amount) {
    amount = balance;
  }

  await tokenContract.callStatic.transfer(receiver, amount);
  const { proceed } = await prompts({
    type: "confirm",
    name: "proceed",
    message: `send ${amount} to safe ${receiver}?`,
  });

  if (!proceed) {
    console.log("WARN: skipping");
    return;
  }

  console.log("WARN: sending real transaction");
  const tx = await tokenContract.transfer(receiver, amount);
  console.log("tx sent %s", tx.hash);
  await tx.wait();
  console.log("tx confirmed");
}

if (require.main === module) {
  main()
    .then(() => {
      console.log("done");
      process.exit(0);
    })
    .catch((ex) => {
      console.error(ex);
      process.exit(1);
    });
}
