import { setUintIfDifferent } from "../utils/dataStore";
import { hashString } from "../utils/hash";
import { decimalToFloat } from "../utils/math";
import { createDeployFunction } from "../utils/deploy";

const dependencyNames = ["RoleStore"];

const func = createDeployFunction({
  contractName: "DataStore",
  dependencyNames,
  getDeployArgs: async ({ dependencyContracts }) => {
    return dependencyNames.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
  libraryNames: ["GasUtils", "OrderUtils", "AdlUtils", "PositionStoreUtils", "OrderStoreUtils"],
  afterDeploy: async () => {
    await setUintIfDifferent(hashString("MAX_LEVERAGE"), decimalToFloat(100), "max leverage");
  },
});

export default func;
