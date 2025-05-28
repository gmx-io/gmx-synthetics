import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction } from "../utils/deploy";

const constructorContracts = [
  "DataStore",
  "RoleStore",
  "EventEmitter",
  "MultichainVault",
  "MultichainGmRouter",
  "MultichainGlvRouter",
];

const func = createDeployFunction({
  contractName: "LayerZeroProvider",
  libraryNames: ["MultichainUtils"],
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts }) => {
    return constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
  afterDeploy: async ({ deployedContract, deployments }) => {
    await grantRoleIfNotGranted(deployedContract.address, "CONTROLLER");

    const { get } = deployments;
    const multichainTransferRouter = await get("MultichainTransferRouter");

    const ethersContract = await ethers.getContractAt("MultichainTransferRouter", multichainTransferRouter.address);

    const multichainProvider = await ethersContract.multichainProvider();
    if (multichainProvider !== deployedContract.address) {
      // if MultichainTransferRouter is already initialized, it would throw "Initializable: contract is already initialized"
      await ethersContract.initialize(deployedContract.address);
    }
  },
});

export default func;
