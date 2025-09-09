import hre from "hardhat";
import { setOracleProviderEnabledPayload, timelockWriteMulticall } from "../utils/timelock";

const expectedTimelockMethods = ["signalSetOracleProviderEnabled", "setOracleProviderEnabledAfterSignal"];

async function main() {
  const timelockConfigAddresses = {
    arbitrum: "0x625D4b5456f065756De8d618dE094bE7618e8A0d",
    avalanche: "0x40794bcBCFb347689fa8c4da69f6405Cf0ECf2C5",
    botanix: "0x8fB97fEfF5f7CfbE9c63D51F6CbBC914E425d965",
  };
  const timelock = await hre.ethers.getContractAt("TimelockConfig", timelockConfigAddresses[hre.network.name]);
  console.log("timelock", timelock.address);
  const chainlinkPriceFeedProvider = await hre.ethers.getContract("ChainlinkPriceFeedProvider");
  const chainlinkDataStreamProvider = await hre.ethers.getContract("ChainlinkDataStreamProvider");
  const edgeDataStreamProvider = await hre.ethers.getContract("EdgeDataStreamProvider");

  // TODO: remove the old oracle providers
  // const providersToAdd = {
  //   arbitrum: [
  //     // GmOracleProvider is not included by default as it is meant to be used as
  //     // a backup only in the event that the other providers are not working
  //     // "0x83cBb05AA78014305194450c4AADAc887fe5DF7F", // ChainlinkDataStreamProvider_3
  //     // "0x527FB0bCfF63C47761039bB386cFE181A92a4701", // ChainlinkPriceFeedProvider_3
  //     // "0xF4122dF7Be4Ccd46D7397dAf2387B3A14e53d967", // ChainlinkDataStreamProvider_4
  //   ],
  //   avalanche: [
  //     // GmOracleProvider is not included by default as it is meant to be used as
  //     // a backup only in the event that the other providers are not working
  //     // "0x46088fA22988c40CE5aBC0647a7638D27A8bF7d1", // ChainlinkDataStreamProvider_3
  //     // "0x713c6a2479f6C079055A6AD3690D95dEDCEf9e1e", // ChainlinkPriceFeedProvider_3
  //     "0x236913dBd610D9d77b9B8B62C99aF0FF4E43ce3a", // ChainlinkDataStreamProvider_4
  //   ],
  // };

  const providersToAdd = [
    chainlinkPriceFeedProvider.address,
    chainlinkDataStreamProvider.address,
    edgeDataStreamProvider.address,
  ];

  const multicallWriteParams = [];

  const timelockMethod = process.env.TIMELOCK_METHOD;
  if (!expectedTimelockMethods.includes(timelockMethod)) {
    throw new Error(`Unexpected TIMELOCK_METHOD: ${timelockMethod}`);
  }

  const predecessor = ethers.constants.HashZero;
  const salt = ethers.constants.HashZero;

  for (const provider of providersToAdd) {
    if (timelockMethod === "signalSetOracleProviderEnabled") {
      multicallWriteParams.push(
        timelock.interface.encodeFunctionData(timelockMethod, [provider, true, predecessor, salt])
      );
    } else {
      const { target, payload } = await setOracleProviderEnabledPayload(provider, true);
      multicallWriteParams.push(timelock.interface.encodeFunctionData("execute", [target, payload, predecessor, salt]));
    }
  }

  console.log(`updating ${multicallWriteParams.length} providers`);
  await timelockWriteMulticall({ timelock, multicallWriteParams });
}

main().catch((ex) => {
  console.error(ex);
  process.exit(1);
});
