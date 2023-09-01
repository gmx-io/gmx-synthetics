import { ethers } from "hardhat";
import hre from "hardhat";

async function main() {
  const txHash = process.env.TX;

  if (!txHash) {
    throw new Error("TX env var is not set");
  }

  const tx = await ethers.provider.getTransaction(txHash);

  const localProvider = new ethers.providers.JsonRpcProvider("http://localhost:8545");

  try {
    const block = await localProvider.getBlock("latest");
    console.log(
      "transaction block %s local fork block %s (diff %s)",
      tx.blockNumber,
      block.number,
      tx.blockNumber - block.number
    );
  } catch (ex) {
    console.warn(ex.toString());
    throw new Error("Local fork is not available");
  }

  const localChainId = (await localProvider.getNetwork()).chainId;
  const chainId = (await ethers.provider.getNetwork()).chainId;

  console.log("local chain id %s chain id %s", localChainId, chainId);

  if (localChainId !== chainId) {
    throw new Error(
      `Local fork chainId is not equal to ${hre.network.name} chainId. Set hardhat chainId to ${chainId} in hardhat.config.ts and restart node`
    );
  }

  console.log("setting arbSys code");
  const arbSysAddress = "0x0000000000000000000000000000000000000064";
  const arbSysBytecode =
    "0x6080604052348015600f57600080fd5b506004361060325760003560e01c80632b407a82146037578063a3b1b31d146058575b600080fd5b60466042366004605d565b4090565b60405190815260200160405180910390f35b436046565b600060208284031215606e57600080fd5b503591905056fea264697066735822122067e2d097893a35ed1f215b5a014089ab12e2bbab8ae3f8f5165bb64ab959313c64736f6c63430008120033";
  await localProvider.send("hardhat_setCode", [arbSysAddress, arbSysBytecode]);

  console.log("sending transaction to local fork");
  const result = await localProvider.call({
    to: tx.to,
    data: tx.data,
    from: tx.from,
    gasPrice: tx.gasPrice,
    gasLimit: tx.gasLimit,
  });
  console.log("done result %s", result);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
