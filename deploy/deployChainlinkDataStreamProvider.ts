import { createDeployFunction } from "../utils/deploy";
import { setBoolIfDifferent } from "../utils/dataStore";
import * as keys from "../utils/keys";

const constructorContracts = ["DataStore", "Oracle"];

const func = createDeployFunction({
  contractName: "ChainlinkDataStreamProvider",
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts, gmx, network, get }) => {
    const oracleConfig = await gmx.getOracle();
    let dataStreamFeedVerifierAddress = oracleConfig.dataStreamFeedVerifier;
    if (network.name === "hardhat") {
      const dataStreamFeedVerifier = await get("MockDataStreamVerifier");
      dataStreamFeedVerifierAddress = dataStreamFeedVerifier.address;
    }
    return constructorContracts
      .map((dependencyName) => dependencyContracts[dependencyName].address)
      .concat(dataStreamFeedVerifierAddress);
  },
  afterDeploy: async ({ deployedContract }) => {
    await setBoolIfDifferent(
      keys.isOracleProviderEnabledKey(deployedContract.address),
      true,
      "isOracleProviderEnabledKey"
    );
  },
  id: "ChainlinkDataStreamProvider_1",
});

func.dependencies = func.dependencies.concat(["MockDataStreamVerifier"]);

export default func;