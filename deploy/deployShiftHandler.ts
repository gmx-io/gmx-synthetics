import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction, skipHandlerFunction } from "../utils/deploy";

const constructorContracts = [
  "RoleStore",
  "DataStore",
  "EventEmitter",
  "Oracle",
  "MultichainVault",
  "ShiftVault",
  "DepositHandler",
  "WithdrawalHandler",
  "SwapHandler",
];
const contractName = "ShiftHandler";

const func = createDeployFunction({
  contractName: contractName,
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts }) => {
    return constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
  libraryNames: ["ShiftUtils", "ShiftStoreUtils", "GasUtils"],
  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract, "CONTROLLER");
  },
});

func.skip = skipHandlerFunction(contractName);

export default func;
