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

const orderConstructorContracts = ["ReferralStorage", "MockTimelockV1"];

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

    return [baseParams, dependencyContracts.ReferralStorage.address, dependencyContracts.MockTimelockV1.address];
  },
  libraryNames: ["GasUtils", "MultichainUtils", "OrderStoreUtils", "RelayUtils"],

  afterDeploy: async ({ deployedContract, deployments }) => {
    await grantRoleIfNotGranted(deployedContract, "CONTROLLER");
    await grantRoleIfNotGranted(deployedContract, "ROUTER_PLUGIN");

    const { get } = deployments;

    const mockTimelockV1 = await get("MockTimelockV1");
    const timelockV1 = await ethers.getContractAt("MockTimelockV1", mockTimelockV1.address);

    console.log(`Set MultichainOrderRouter as keeper on MockTimelockV1: ${timelockV1.address}`);
    // Grant keeper role to MultichainOrderRouter to register code using govSetCodeOwner
    await timelockV1.setKeeper(deployedContract.address, true);
    console.log(`MultichainOrderRouter is now keeper on MockTimelockV1`);

    // Set MultichainOrderRouter as handler on ReferralStorage for setTraderReferralCode
    const referralStorage = await get("ReferralStorage");
    console.log(`Setting MultichainOrderRouter as handler on ReferralStorage: ${referralStorage.address}`);
    await timelockV1.setHandler(referralStorage.address, deployedContract.address, true);
    console.log(`MultichainOrderRouter is now handler on ReferralStorage`);
  },
});

export default func;
