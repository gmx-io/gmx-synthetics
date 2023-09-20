import hre from "hardhat";
import { getFrameSigner } from "../utils/signer";

const expectedTimelockMethods = ["signalSetRealtimeFeed", "setRealtimeFeedAfterSignal"];

async function main() {
  const signer = await getFrameSigner();
  const timelock = await hre.ethers.getContract("Timelock", signer);
  console.log("timelock", timelock.address);

  const realtimeFeedConfig = {
    arbitrum: [
      {
        token: "0x47904963fc8b2340414262125aF798B9655E58Cd",
        feedId: "0x0f49a4533a64c7f53bfdf5e86d791620d93afdec00cfe1896548397b0f4ec81c",
        realtimeFeedMultiplier: "100000000000000000000000000000000000000000000",
      },
      {
        token: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
        feedId: "0x0f49a4533a64c7f53bfdf5e86d791620d93afdec00cfe1896548397b0f4ec81c",
        realtimeFeedMultiplier: "100000000000000000000000000000000000000000000",
      },
      {
        token: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
        feedId: "0x74aca63821bf7ead199e924d261d277cbec96d1026ab65267d655c51b4536914",
        realtimeFeedMultiplier: "10000000000000000000000000000000000",
      },
      {
        token: "0xC4da4c24fd591125c3F47b340b6f4f76111883d8",
        feedId: "0x5f82d154119f4251d83b2a58bf61c9483c84241053038a2883abf16ed4926433",
        realtimeFeedMultiplier: "100000000000000000000000000000000000000000000",
      },
      {
        token: "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4",
        feedId: "0x64ee16b94fdd72d0b3769955445cc82d6804573c22f0f49b67cd02edd07461e7",
        realtimeFeedMultiplier: "10000000000000000000000000000000000",
      },
      {
        token: "0x912CE59144191C1204E64559FE8253a0e49E6548",
        feedId: "0xb43dc495134fa357725f93539511c5a4febeadf56e7c29c96566c825094f0b20",
        realtimeFeedMultiplier: "10000000000000000000000000000000000",
      },
      {
        token: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
        feedId: "0x95241f154d34539741b19ce4bae815473fd1b2a90ac3b4b023a692f31edfe90e",
        realtimeFeedMultiplier: "10000000000000000000000000000000000000000000000",
      },
      {
        token: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
        feedId: "0x95241f154d34539741b19ce4bae815473fd1b2a90ac3b4b023a692f31edfe90e",
        realtimeFeedMultiplier: "10000000000000000000000000000000000000000000000",
      },
      {
        token: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
        feedId: "0x297cc1e1ee5fc2f45dff1dd11a46694567904f4dbc596c7cc216d6c688605a1b",
        realtimeFeedMultiplier: "10000000000000000000000000000000000000000000000",
      },
    ],
  };

  const multicallWriteParams = [];

  const timelockMethod = process.env.TIMELOCK_METHOD;
  if (!expectedTimelockMethods.includes(timelockMethod)) {
    throw new Error(`Unexpected TIMELOCK_METHOD: ${timelockMethod}`);
  }

  for (const { token, feedId, realtimeFeedMultiplier } of realtimeFeedConfig[hre.network.name]) {
    multicallWriteParams.push(
      timelock.interface.encodeFunctionData(timelockMethod, [token, feedId, realtimeFeedMultiplier])
    );
  }

  console.log(`updating ${multicallWriteParams.length} feeds`);
  console.log("multicallWriteParams", multicallWriteParams);

  if (process.env.WRITE === "true") {
    await timelock.multicall(multicallWriteParams);
  } else {
    console.log("NOTE: executed in read-only mode, no transactions were sent");
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
