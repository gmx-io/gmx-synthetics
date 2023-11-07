import fs from "fs";
import { BigNumber } from "ethers";

import hre from "hardhat";
import { range } from "lodash";
import { bigNumberify } from "../../utils/math";
import path from "path";
import BatchSenderAbi from "./abi/BatchSender";
import { getFrameSigner } from "./helpers";

/*
Example of usage:

FILENAME=distribution_2023-10-18.json npx hardhat --network arbitrum run batchSend.ts
*/

const shouldSendTxn = process.env.WRITE === "true";

function getArbValues() {
  return {
    batchSenderAddress: "0x1070f775e8eb466154BBa8FA0076C4Adc7FE17e8",
    walletAddress: "0x5F799f365Fa8A2B60ac0429C48B153cA5a6f0Cf8",
  };
}

function getValues() {
  if (hre.network.name === "arbitrum") {
    return getArbValues();
  }

  throw new Error(`unsupported network ${hre.network.name}`);
}

async function main() {
  const filename = process.env.FILENAME;

  if (!filename) {
    throw new Error("FILENAME is required");
  }

  const filepath = filename.startsWith("/") ? filename : path.join(process.cwd(), filename);
  console.log("reading file %s", filepath);
  const data: {
    token: string;
    amounts: Record<string, string>;
    distributionTypeId: number;
  } = JSON.parse(fs.readFileSync(filepath).toString());

  if (!data.token) {
    throw new Error("Invalid file format. It should contain `token` string");
  }
  if (!data.amounts || typeof data.amounts !== "object") {
    throw new Error("Invalid file format. It should contain `amounts` object");
  }
  if (!data.distributionTypeId) {
    throw new Error("Invalid file format. It should contain `distributionTypeId` number");
  }

  const { batchSenderAddress, walletAddress } = getValues();

  const amounts: BigNumber[] = [];
  const recipients: string[] = [];
  let totalAmount = bigNumberify(0);

  for (const [recipient, amount] of Object.entries(data.amounts)) {
    amounts.push(bigNumberify(amount));
    recipients.push(recipient);
    totalAmount = totalAmount.add(amount);
  }

  console.log("token %s", data.token);
  console.log("total amount %s", totalAmount.toString());
  console.log("recipients %s", recipients.length);
  console.log("distribution type id %s", data.distributionTypeId);

  if (shouldSendTxn) {
    const signer = await getFrameSigner();
    const batchSender = await hre.ethers.getContractAt(BatchSenderAbi, batchSenderAddress, signer);
    const tokenContract = await hre.ethers.getContractAt("MintableToken", data.token, signer);
    const batchSize = 150;

    const totalAmount = amounts.reduce((acc, amount) => {
      return acc.add(amount);
    }, bigNumberify(0));

    const allowance = await tokenContract.allowance(walletAddress, batchSenderAddress);
    if (allowance.lt(totalAmount)) {
      console.log("current allowance is %s", allowance);
      console.log("approving token %s amount %s spender %s", data.token, totalAmount, batchSenderAddress);
      const tx = await tokenContract.approve(batchSenderAddress, totalAmount);
      console.log("sent approve txn %s", tx.hash);
    }

    for (const i of range(amounts, batchSize)) {
      const from = i * batchSize;
      const to = i * batchSize + batchSize;
      const batchAmounts = amounts.slice(from, to);
      const batchRecipients = recipients.slice(from, to);

      console.log(
        "sending batch %s %s token %s typeId %s",
        i,
        batchRecipients.length,
        data.token,
        data.distributionTypeId
      );
      const tx = await batchSender.sendAndEmit(data.token, batchRecipients, batchAmounts, data.distributionTypeId);
      console.log("sent batch txn %s", tx.hash);
    }
  }

  // approve totalAmount

  // sendAndEmit
}

main()
  .then(() => {
    console.log("done");
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
