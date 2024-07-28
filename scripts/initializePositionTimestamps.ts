import hre from "hardhat";
import * as keys from "../utils/keys";

async function main() {
  const timestampInitializer = await hre.ethers.getContract("TimestampInitializer");
  const dataStore = await hre.ethers.getContract("DataStore");

  const positionsCount = await dataStore.getBytes32Count(keys.POSITION_LIST);

  let limit = positionsCount;
  if (process.env.LIMIT) {
    limit = Math.min(Number(process.env.LIMIT), positionsCount);
  }
  console.log("positionsCount: %s limit: %s", positionsCount, limit);

  const chunkLength = 100;
  for (let from = 0; from < limit; from += chunkLength) {
    const to = Math.min(limit, from + chunkLength);
    console.log("updating positions chunk %s-%s", from, to);

    if (process.env.WRITE === "true") {
      const tx = await timestampInitializer.initializePositionTimestamps(from, to);
      console.log("tx sent %s", tx.hash);
    } else {
      await hre.ethers.provider.call({
        to: timestampInitializer.address,
        data: timestampInitializer.interface.encodeFunctionData("initializePositionTimestamps", [from, to]),
        from: "0xe47b36382dc50b90bcf6176ddb159c4b9333a7ab",
      });
    }
  }
  console.log("done");
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
