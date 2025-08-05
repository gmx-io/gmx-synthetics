import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction } from "../utils/deploy";

const baseConstructorContracts = [
  "Router",
  "RoleStore",
  "DataStore",
  "EventEmitter",
  "Oracle",
  "OrderVault",
  "OrderHandler",
  "SwapHandler",
  "ExternalHandler",
  "MultichainVault",
];

const orderConstructorContracts = ["ReferralStorage"];

const func = createDeployFunction({
  contractName: "MultichainOrderRouter",
  dependencyNames: [...baseConstructorContracts, ...orderConstructorContracts],
  getDeployArgs: async ({ dependencyContracts }) => {
    const baseParams = {
      router: dependencyContracts.Router.address,
      roleStore: dependencyContracts.RoleStore.address,
      dataStore: dependencyContracts.DataStore.address,
      eventEmitter: dependencyContracts.EventEmitter.address,
      oracle: dependencyContracts.Oracle.address,
      orderVault: dependencyContracts.OrderVault.address,
      orderHandler: dependencyContracts.OrderHandler.address,
      swapHandler: dependencyContracts.SwapHandler.address,
      externalHandler: dependencyContracts.ExternalHandler.address,
      multichainVault: dependencyContracts.MultichainVault.address,
    };

    return [baseParams, dependencyContracts.ReferralStorage.address];
  },
  libraryNames: ["GasUtils", "MultichainUtils", "OrderStoreUtils", "RelayUtils"],

  afterDeploy: async ({ gmx, deployedContract, deployments }) => {
    await grantRoleIfNotGranted(deployedContract, "CONTROLLER");
    await grantRoleIfNotGranted(deployedContract, "ROUTER_PLUGIN");

    if (!gmx.isExistingMainnetDeployment) {
      const { get } = deployments;
      const referralStorage = await get("ReferralStorage");
      const referralStorageContract = await ethers.getContractAt("ReferralStorage", referralStorage.address);
      console.log(`Grant handler role to MultichainOrderRouter in ReferralStorage: ${referralStorage.address}`);
      await referralStorageContract.setHandler(deployedContract.address, true);
    }
  },
});

export default func;
