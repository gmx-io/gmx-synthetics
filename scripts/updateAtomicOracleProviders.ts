import hre from "hardhat";
import { setAtomicOracleProviderPayload, timelockWriteMulticall } from "../utils/timelock";

const expectedTimelockMethods = ["signalSetAtomicOracleProvider", "setAtomicOracleProviderAfterSignal"];

async function main() {
  const timelock = await hre.ethers.getContract("TimelockConfig");

  // const chainlinkPriceFeedProvider = await hre.ethers.getContract("ChainlinkPriceFeedProvider");
  const chainlinkDataStreamProvider = await hre.ethers.getContract("ChainlinkDataStreamProvider");

  const providersToAdd = [chainlinkDataStreamProvider.address];

  const multicallWriteParams = [];

  const predecessor = ethers.constants.HashZero;
  const salt = ethers.constants.HashZero;

  const timelockMethod = process.env.TIMELOCK_METHOD;
  if (!expectedTimelockMethods.includes(timelockMethod)) {
    throw new Error(`Unexpected TIMELOCK_METHOD: ${timelockMethod}`);
  }

  for (const provider of providersToAdd) {
    // signal set atomic oracle provider to "false" as well as "true" (below)
    //  in case a revert is needed
    if (timelockMethod === "signalSetAtomicOracleProvider") {
      multicallWriteParams.push(
        timelock.interface.encodeFunctionData(timelockMethod, [provider, false, predecessor, salt])
      );
      multicallWriteParams.push(
        timelock.interface.encodeFunctionData(timelockMethod, [provider, true, predecessor, salt])
      );
    } else {
      const { target, payload } = await setAtomicOracleProviderPayload(provider, true);
      multicallWriteParams.push(timelock.interface.encodeFunctionData("execute", [target, payload, predecessor, salt]));
    }
  }

  console.log(`sending ${multicallWriteParams.length} updates`);
  await timelockWriteMulticall({ timelock, multicallWriteParams });
}

main().catch((ex) => {
  console.error(ex);
  process.exit(1);
});
