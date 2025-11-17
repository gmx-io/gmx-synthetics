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
  },
});

export default func;
