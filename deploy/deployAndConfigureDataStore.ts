import { setUintIfDifferent } from "../utils/dataStore";
import { hashString } from "../utils/hash";
import { createDeployFunction } from "../utils/deploy";

const constructorContracts = ["RoleStore"];

const func = createDeployFunction({
  contractName: "DataStore",
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts }) => {
    return constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
  libraryNames: ["GasUtils", "OrderUtils", "AdlUtils", "PositionStoreUtils", "OrderStoreUtils"],
  afterDeploy: async ({ gmx }) => {
    const generalConfig = await gmx.getGeneral();
    await setUintIfDifferent(
      hashString("MAX_CALLBACK_GAS_LIMIT"),
      generalConfig.maxCallbackGasLimit,
      "max callback gas limit"
    );
    await setUintIfDifferent(hashString("MIN_COLLATERAL_USD"), generalConfig.minCollateralUsd, "min collateral USD");
    await setUintIfDifferent(
      hashString("CLAIMABLE_COLLATERAL_TIME_DIVISOR"),
      generalConfig.minCollateralUsd,
      "claimable collateral time divisor"
    );
  },
});

export default func;
