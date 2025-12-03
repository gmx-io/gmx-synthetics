import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction, skipHandlerFunction } from "../utils/deploy";

const constructorContracts = [
  "RoleStore",
  "DataStore",
  "EventEmitter",
  "MultichainVault",
  "OrderVault",
  "SwapHandler",
  "ReferralStorage",
  "OrderHandler",
  "GlvShiftHandler",
];
const contractName = "JitOrderHandler";
const requireMockTimelock = !["arbitrum", "avalanche", "botanix"].includes(hre.network.name);

const func = createDeployFunction({
  contractName: contractName,
  dependencyNames: [...constructorContracts, ...(requireMockTimelock ? ["MockTimelockV1"] : [])],
  getDeployArgs: async ({ dependencyContracts }) => {
    return constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
  libraryNames: ["GasUtils", "MarketUtils", "OrderStoreUtils", "GlvUtils", "GlvShiftEventUtils"],
  afterDeploy: async ({ deployedContract, getNamedAccounts, deployments }) => {
    const { deployer } = await getNamedAccounts();
    const { execute } = deployments;

    if (requireMockTimelock) {
      const referralStorage = await deployments.get("ReferralStorage");
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
