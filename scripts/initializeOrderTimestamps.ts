import hre from "hardhat";
import * as keys from "../utils/keys";

async function main() {
  const timestampInitializer = await hre.ethers.getContract("TimestampInitializer");
  const dataStore = await hre.ethers.getContract("DateStore");

  const ordersCount = await dataStore.getBytes32Count(keys.ORDER_LIST);

  const chunkLength = 100;
  for (let from = 0; from < ordersCount; from += chunkLength) {
    const to = Math.min(ordersCount, from + chunkLength);
    console.log("updating orders chunk %s-%s", from, to);

    if (process.env.WRITE === "true") {
      const tx = await timestampInitializer.initializeOrderTimestamps(from, to);
      console.log("tx sent %s", tx.hash);
    } else {
      await timestampInitializer.callStatic.initializeOrderTimestamps(from, to, {
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
