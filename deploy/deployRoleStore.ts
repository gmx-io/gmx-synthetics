import { HardhatRuntimeEnvironment } from "hardhat/types";
import { grantRoleIfNotGranted } from "../utils/role";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("RoleStore", {
    from: deployer,
    log: true,
  });

  for (const role of ["CONTROLLER", "ORDER_KEEPER", "MARKET_KEEPER", "LIQUIDATION_KEEPER", "FROZEN_ORDER_KEEPER"]) {
    await grantRoleIfNotGranted(deployer, role);
  }
};
func.tags = ["RoleStore"];
func.dependencies = ["Init"];
export default func;
