import { HardhatRuntimeEnvironment } from "hardhat/types";
import { hashString } from "../utils/hash";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, execute } = deployments;
  const { deployer } = await getNamedAccounts();

  const { newlyDeployed } = await deploy("RoleStore", {
    from: deployer,
    log: true,
  });

  if (newlyDeployed) {
    await execute("RoleStore", { from: deployer, log: true }, "grantRole", deployer, hashString("CONTROLLER"));
    await execute("RoleStore", { from: deployer, log: true }, "grantRole", deployer, hashString("ORDER_KEEPER"));
    await execute("RoleStore", { from: deployer, log: true }, "grantRole", deployer, hashString("MARKET_KEEPER"));
  }
};
func.tags = ["RoleStore"];
func.dependencies = ["Init"];
export default func;
