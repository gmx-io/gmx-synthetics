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
  "OrderHandler",
  "GlvShiftHandler",
];
const contractName = "JitOrderHandler";

const func = createDeployFunction({
  contractName: contractName,
  dependencyNames: [...constructorContracts, "MockTimelockV1"],
  getDeployArgs: async ({ dependencyContracts }) => {
    return constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
  libraryNames: ["GasUtils", "MarketUtils", "OrderStoreUtils", "GlvUtils", "GlvShiftEventUtils"],
  afterDeploy: async ({ deployedContract, getNamedAccounts, deployments, network }) => {
    const { deployer } = await getNamedAccounts();
    const { execute } = deployments;

    const referralStorage = await deployments.get("ReferralStorage");
    if (!["arbitrum", "avalanche", "botanix"].includes(network.name)) {
      await execute(
        "MockTimelockV1",
        { from: deployer, log: true },
        "setHandler",
        referralStorage.address,
        deployedContract.address,
        true
      );
    }

    await grantRoleIfNotGranted(deployedContract, "CONTROLLER");
  },
});

func.skip = skipHandlerFunction(contractName);

export default func;
