import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction, skipHandlerFunction } from "../utils/deploy";

const constructorContracts = [
  "RoleStore",
  "DataStore",
  "EventEmitter",
  "Oracle",
  "MultichainVault",
  "OrderVault",
  "SwapHandler",
  "ReferralStorage",
];
const contractName = "OrderHandler";

const func = createDeployFunction({
  contractName: contractName,
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts }) => {
    return constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
  libraryNames: ["OrderUtils", "ExecuteOrderUtils", "OrderStoreUtils", "OrderEventUtils", "GasUtils", "MarketUtils"],
  afterDeploy: async ({ deployedContract, getNamedAccounts, deployments, network }) => {
    const { deployer } = await getNamedAccounts();
    const { execute } = deployments;

    if (!["arbitrum", "avalanche"].includes(network.name)) {
      await execute("ReferralStorage", { from: deployer, log: true }, "setHandler", deployedContract.address, true);
    }

    await grantRoleIfNotGranted(deployedContract.address, "CONTROLLER");
  },
});

func.skip = skipHandlerFunction(contractName);

export default func;
