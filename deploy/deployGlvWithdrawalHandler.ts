import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction, skipHandlerFunction } from "../utils/deploy";

const constructorContracts = [
  "RoleStore",
  "DataStore",
  "EventEmitter",
  "Oracle",
  "MultichainVault",
  "MultichainTransferRouter",
  "GlvVault",
  "SwapHandler",
];
const contractName = "GlvWithdrawalHandler";

const func = createDeployFunction({
  contractName: contractName,
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts }) => {
    return constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
  libraryNames: ["GasUtils", "GlvUtils", "GlvWithdrawalStoreUtils", "GlvWithdrawalUtils"],
  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract.address, "CONTROLLER");
  },
});

func.skip = skipHandlerFunction(contractName);

export default func;
