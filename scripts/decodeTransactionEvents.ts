import hre from "hardhat";

async function main() {
  console.log("Network: %s", hre.network.name);

  const txHash = process.env.TX;
  if (!txHash) {
    throw new Error(
      "Missing TX env var. Example of usage: `TX=0x123... npx hardhat run scripts/decodeTransactionEvents.ts`"
    );
  }
  console.log("Retrieving transaction %s", txHash);

  const receipt = await hre.ethers.provider.getTransactionReceipt(txHash);
  if (!receipt) {
    throw new Error("Transaction not found");
  }

  const artifact = await hre.deployments.getArtifact("EventEmitter");
  const eventEmitterInterface = new hre.ethers.utils.Interface(artifact.abi);
  for (const [i, log] of receipt.logs.entries()) {
    try {
      const parsedLog = eventEmitterInterface.parseLog(log);
      const eventName = parsedLog.args[1];
      const eventData = parsedLog.args[parsedLog.args.length - 1];
      console.log("\nLog %s %s: %s", i, parsedLog.name, eventName);

      for (const [i, topic] of log.topics.entries()) {
        console.log("  Topic %s: %s", i, topic);
      }

      console.log("  Data:");
      for (const type of ["address", "uint", "int", "bool", "bytes32", "bytes", "string"]) {
        const key = `${type}Items`;
        for (const item of eventData[key].items) {
          console.log("    %s: %s (%s)", item.key, item.value, type);
        }
      }
      console.log("");
    } catch (ex) {
      console.info("Can't parse log %s", i);
    }
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
