import { createDeployFunction } from "../utils/deploy";
import { grantRoleIfNotGranted } from "../utils/role";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = createDeployFunction({
  contractName: "OracleModuleTest",
  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract.address, "CONTROLLER");
  },
});

func.skip = async ({ network }: HardhatRuntimeEnvironment) => {
  return network.name !== "hardhat";
};

export default func;
