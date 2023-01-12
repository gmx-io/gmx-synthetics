import hre from "hardhat";

async function main() {
  const txHash = "0x2ce08b13a6ebad750d35a202f8808be3558470c8869add62a2b140dc993bbba5";

  const eventEmitter = await hre.ethers.getContract("EventEmitter");
  const receipt = await hre.ethers.provider.getTransactionReceipt(txHash);

  for (const log of receipt.logs) {
    try {
      const event = eventEmitter.interface.parseLog(log);
      console.log(event.name);
      for (const [key, value] of Object.entries(event.args)) {
        if (!isNaN(Number(key))) {
          continue;
        }
        if (typeof value === "object") {
          console.log("  %s:", key);
          for (const [key2, value2] of Object.entries(value)) {
            if (!isNaN(Number(key2))) {
              continue;
            }
            console.log("    %s: %s", key2, value2.toString());
          }
        } else {
          console.log("  %s: %s", key, value);
        }
      }
      // eslint-disable-next-line no-empty
    } catch (ex) {}
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
