import hre from "hardhat";

async function main() {
  const configSyncer = await hre.ethers.getContract("ConfigSyncer");

  if (!process.env.MARKETS) {
    throw new Error("MARKETS env var is required");
  }
  if (!process.env.PARAMETERS) {
    throw new Error("PARAMETERS env var is required");
  }

  const parameters = process.env.PARAMETERS.split(",").map((v) => v.trim());
  const markets = process.env.MARKETS.split(",").map((v) => v.trim());

  if (process.env.WRITE === "true") {
    const tx = await configSyncer.sync(markets, parameters);
    console.log(`txn sent: ${tx.hash}`);
  } else {
    await configSyncer.callStatic.sync(markets, parameters);
    console.log("simulation done");
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
