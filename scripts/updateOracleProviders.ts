import hre from "hardhat";
import { PROTOCOL_MULTISIG } from "../utils/constants";
import { inputsOf, writeSafeBatchJson } from "../utils/safeTx";
import { setOracleProviderEnabledPayload, timelockWriteMulticall } from "../utils/timelock";
import { getTimelockConfig } from "../utils/timelockConfig";

const expectedTimelockMethods = ["signalSetOracleProviderEnabled", "setOracleProviderEnabledAfterSignal"];

async function main() {
  const timelock = await getTimelockConfig();
  const chainlinkPriceFeedProvider = await hre.ethers.getContract("ChainlinkPriceFeedProvider");
  const chainlinkDataStreamProvider = await hre.ethers.getContract("ChainlinkDataStreamProvider");
  const edgeDataStreamProvider = await hre.ethers.getContract("EdgeDataStreamProvider");
  const staticPriceProvider = await hre.ethers.getContract("StaticOracleProvider");

  // TODO: remove the old oracle providers
  // const providersToAdd = {
  //   arbitrum: [
  //     // "0x83cBb05AA78014305194450c4AADAc887fe5DF7F", // ChainlinkDataStreamProvider_3
  //     // "0x527FB0bCfF63C47761039bB386cFE181A92a4701", // ChainlinkPriceFeedProvider_3
  //     // "0xF4122dF7Be4Ccd46D7397dAf2387B3A14e53d967", // ChainlinkDataStreamProvider_4
  //   ],
  //   avalanche: [
  //     // "0x46088fA22988c40CE5aBC0647a7638D27A8bF7d1", // ChainlinkDataStreamProvider_3
  //     // "0x713c6a2479f6C079055A6AD3690D95dEDCEf9e1e", // ChainlinkPriceFeedProvider_3
  //     "0x236913dBd610D9d77b9B8B62C99aF0FF4E43ce3a", // ChainlinkDataStreamProvider_4
  //   ],
  // };

  const providersToAdd = [
    chainlinkPriceFeedProvider.address,
    chainlinkDataStreamProvider.address,
    // edgeDataStreamProvider.address,
    // staticPriceProvider.address,
  ];

  const multicallWriteParams = [];
  const safeBatchTransactions = [];

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
      safeBatchTransactions.push({
        to: timelock.address,
        value: "0",
        data: null,
        contractMethod: {
          name: timelockMethod,
          payable: false,
          inputs: inputsOf(timelock, timelockMethod),
        },
        contractInputsValues: { provider, value: "true", predecessor, salt },
      });
    } else {
      const { target, payload } = await setOracleProviderEnabledPayload(provider, true);
      multicallWriteParams.push(timelock.interface.encodeFunctionData("execute", [target, payload, predecessor, salt]));
      safeBatchTransactions.push({
        to: timelock.address,
        value: "0",
        data: null,
        contractMethod: {
          name: "execute",
          payable: false,
          inputs: inputsOf(timelock, "execute"),
        },
        contractInputsValues: { target, payload, predecessor, salt },
      });
    }
  }

  console.log(`updating ${multicallWriteParams.length} providers`);

  // the same calls as a Safe Transaction Builder batch, to sign via the multisig. Load in Safe -> Transaction Builder.
  writeSafeBatchJson({
    scriptName: "updateOracleProviders",
    label: timelockMethod,
    transactions: safeBatchTransactions,
    createdFromSafeAddress: PROTOCOL_MULTISIG,
  });

  await timelockWriteMulticall({ timelock, multicallWriteParams });
}

main().catch((ex) => {
  console.error(ex);
  process.exit(1);
});
