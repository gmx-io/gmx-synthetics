import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction } from "../utils/deploy";

const constructorContracts = ["RoleStore", "DataStore", "EventEmitter"];

const func = createDeployFunction({
  contractName: "Config",
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts, gmx, network, get }) => {
    const chainlinkFlags = await gmx.getChainlinkFlags();
    let chainlinkFlagsAddress = chainlinkFlags.flags;
    if (network.name === "hardhat") {
      const flags = await get("MockFlags");
      chainlinkFlagsAddress = flags.address;
    }
    if (!chainlinkFlagsAddress) {
      throw new Error("chainlinkFlagsAddress is not defined");
    }
    return constructorContracts
      .map((dependencyName) => dependencyContracts[dependencyName].address)
      .concat(chainlinkFlagsAddress);
  },
  libraryNames: ["MarketUtils", "ConfigUtils"],
  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract, "CONTROLLER");
  },
});

func.dependencies = func.dependencies.concat(["MockFlags"]);

export default func;
