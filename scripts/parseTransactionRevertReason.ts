import hre from "hardhat";
import { formatParsedError, parseError } from "../utils/error";
async function main() {
  console.log("Network: %s", hre.network.name);

  const txHash = process.env.TX;
  if (!txHash) {
    throw new Error(
      "Missing TX env var. Example of usage: `TX=0x123... npx hardhat run scripts/decodeTransactionEvents.ts`"
    );
  }
  console.log("Retrieving transaction %s", txHash);

  const [tx, receipt] = await Promise.all([
    hre.ethers.provider.getTransaction(txHash),
    hre.ethers.provider.getTransactionReceipt(txHash),
  ]);
  if (!receipt) {
    throw new Error("Transaction not found");
  }

  console.log("Transaction: %s", tx);

  const result = await hre.ethers.provider.call(
    {
      to: tx.to,
      data: tx.data,
      from: tx.from,
      value: tx.value,
      gasLimit: tx.gasLimit,
      gasPrice: tx.gasPrice,
      maxFeePerGas: tx.maxFeePerGas,
      maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
    },
    tx.blockNumber
  );
  console.log("Result: %s", result);

  const error = parseError(result);
  if (error) {
    console.log(formatParsedError(error));
  } else {
    console.log("Can't parse error");
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex.toString());
    process.exit(1);
  });
