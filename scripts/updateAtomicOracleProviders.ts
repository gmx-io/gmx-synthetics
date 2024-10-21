import hre from "hardhat";
import { timelockWriteMulticall } from "../utils/timelock";

const expectedTimelockMethods = ["signalSetAtomicOracleProvider", "setAtomicOracleProviderAfterSignal"];

async function main() {
  const timelock = await hre.ethers.getContract("Timelock");

  const providersToAdd = {
    arbitrum: [
      "0x527FB0bCfF63C47761039bB386cFE181A92a4701", // ChainlinkPriceFeedProvider
    ],
    avalanche: [
      "0x713c6a2479f6C079055A6AD3690D95dEDCEf9e1e", // ChainlinkPriceFeedProvider
    ],
  };

  const multicallWriteParams = [];

  const timelockMethod = process.env.TIMELOCK_METHOD;
  if (!expectedTimelockMethods.includes(timelockMethod)) {
    throw new Error(`Unexpected TIMELOCK_METHOD: ${timelockMethod}`);
  }

  for (const provider of providersToAdd[hre.network.name]) {
    // signal set atomic oracle provider to "false" as well as "true" (below)
    //  in case a revert is needed
    if (timelockMethod === "signalSetAtomicOracleProvider") {
      multicallWriteParams.push(timelock.interface.encodeFunctionData(timelockMethod, [provider, false]));
    }

    multicallWriteParams.push(timelock.interface.encodeFunctionData(timelockMethod, [provider, true]));
  }

  console.log(`sending ${multicallWriteParams.length} updates`);
  await timelockWriteMulticall({ timelock, multicallWriteParams });
}

main().catch((ex) => {
  console.error(ex);
  process.exit(1);
});
