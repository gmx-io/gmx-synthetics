import hre, { ethers } from "hardhat";
import { formatAmount } from "../../utils/math";
import { setTimeout } from "timers/promises";

const shouldSendTxn = process.env.WRITE === "true";

function getArbValues() {
  return {
    tokenAddress: "0x912ce59144191c1204e64559fe8253a0e49e6548",
    receiver: "0xb6fd0bdb1432b2c77170933120079f436f3bb4fa",
  };
}

function getValues() {
  if (hre.network.name === "arbitrum") {
    return getArbValues();
  }

  throw new Error(`unsupported network ${hre.network.name}`);
}

async function main() {
  if (!process.env.BATCH_SENDER_KEY) {
    throw new Error("BATCH_SENDER_KEY is required");
  }

  const wallet = new ethers.Wallet(process.env.BATCH_SENDER_KEY);
  const signer = wallet.connect(ethers.provider);

  const { tokenAddress, receiver } = getValues();
  const tokenContract = await ethers.getContractAt("MintableToken", tokenAddress, signer);

  console.log("token %s", tokenAddress);
  console.log("receiver %s", receiver);

  const balance = await tokenContract.balanceOf(signer.address);
  console.log("balance is %s", formatAmount(balance, 18, 2, true));

  if (shouldSendTxn) {
    console.log("WARN: sending real transaction");
    await setTimeout(5000);
    const tx = await tokenContract.transfer(receiver, balance);
    console.log("tx sent %s", tx.hash);
  } else {
    await tokenContract.callStatic.transfer(receiver, balance);
  }
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
