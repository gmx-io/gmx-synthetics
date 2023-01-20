import { setUintIfDifferent } from "../utils/dataStore";
import { hashString } from "../utils/hash";
import { decimalToFloat } from "../utils/math";
import { createDeployFunction } from "../utils/deploy";

const constructorContracts = ["RoleStore"];

const func = createDeployFunction({
  contractName: "DataStore",
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts }) => {
    return constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
  libraryNames: ["GasUtils", "OrderUtils", "AdlUtils", "PositionStoreUtils", "OrderStoreUtils"],
  afterDeploy: async () => {
    await setUintIfDifferent(hashString("MAX_CALLBACK_GAS_LIMIT"), 2 * 1000 * 1000, "max callback gas limit"); // 1%
    await setUintIfDifferent(hashString("MIN_COLLATERAL_USD"), decimalToFloat(1), "min collateral USD");
  },
});

export default func;
