import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction } from "../utils/deploy";
import * as keys from "../utils/keys";

const constructorContracts = [
  "DataStore",
  "RoleStore",
  "EventEmitter",
  "MultichainVault",
  "MultichainGmRouter",
  "MultichainGlvRouter",
  "MultichainOrderRouter",
];

const func = createDeployFunction({
  contractName: "LayerZeroProvider",
  libraryNames: ["GasUtils", "GlvUtils", "MultichainUtils"],
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts }) => {
    return constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
  afterDeploy: async ({ deployedContract, deployments }) => {
    await grantRoleIfNotGranted(deployedContract, "CONTROLLER");

    const { get } = deployments;
    const multichainTransferRouter = await get("MultichainTransferRouter");

    const ethersContract = await ethers.getContractAt("MultichainTransferRouter", multichainTransferRouter.address);

    const multichainProvider = await ethersContract.multichainProvider();
    if (multichainProvider !== deployedContract.address) {
      // if MultichainTransferRouter is already initialized, it would throw "Initializable: contract is already initialized"
      await ethersContract.initialize(deployedContract.address);
    }

    // Exclude LayerZeroProvider from paying relay fees
    // Relay fee is excluded for calls made through the IMultichainProvider
    // as the user already paid for execution on the source chain
    const dataStoreDeployment = await get("DataStore");
    const dataStore = await ethers.getContractAt("DataStore", dataStoreDeployment.address);

    console.log(`Excluding LayerZeroProvider from relay fees: ${deployedContract.address}`);
    await dataStore.setBool(keys.isRelayFeeExcludedKey(deployedContract.address), true);
    console.log(`LayerZeroProvider is now excluded from relay fees`);
  },
});

export default func;
