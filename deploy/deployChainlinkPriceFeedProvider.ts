import { createDeployFunction } from "../utils/deploy";
import { setBoolIfDifferent } from "../utils/dataStore";
import * as keys from "../utils/keys";

const constructorContracts = ["DataStore"];

const func = createDeployFunction({
  contractName: "ChainlinkPriceFeedProvider",
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts }) => {
    return constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
  afterDeploy: async ({ deployedContract }) => {
    await setBoolIfDifferent(
      keys.isOracleProviderEnabledKey(deployedContract.address),
      true,
      "isOracleProviderEnabledKey"
    );

    await setBoolIfDifferent(
      keys.isAtomicOracleProviderKey(deployedContract.address),
      true,
      "isAtomicOracleProviderKey"
    );
  },
  id: "ChainlinkPriceFeedProvider_2",
});

export default func;
