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
  libraryNames: ["GasUtils", "GlvUtils", "MultichainUtils", "LayerZeroProviderUtils"],
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts, network, get }) => {
    // the staking router deploys on arbitrum only, same gate as deployMultichainStakingRouter;
    // the provider takes the zero address on networks without it
    const stakingRouterNetworks = ["hardhat", "arbitrum"];
    const stakingRouterAddress = stakingRouterNetworks.includes(network.name)
      ? (await get("MultichainStakingRouter")).address
      : ethers.constants.AddressZero;

    return [
      ...constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address),
      stakingRouterAddress,
    ];
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

// the staking router can't be a dependencyName (its eager resolution would throw on
// every network it doesn't deploy on); keep it in the dependency graph so it deploys
// before the provider where it does exist
func.dependencies = func.dependencies.concat(["MultichainStakingRouter"]);

export default func;
