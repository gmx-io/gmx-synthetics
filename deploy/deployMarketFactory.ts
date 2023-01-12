import { HardhatRuntimeEnvironment } from "hardhat/types";
import { grantRoleIfNotGranted } from "../utils/role";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const roleStore = await get("RoleStore");
  const dataStore = await get("DataStore");
  const marketStore = await get("MarketStore");

  const { address } = await deploy("MarketFactory", {
    from: deployer,
    log: true,
    args: [roleStore.address, dataStore.address, marketStore.address],
  });

  await grantRoleIfNotGranted(address, "CONTROLLER");
};
func.tags = ["MarketFactory"];
func.dependencies = ["RoleStore", "DataStore", "MarketStore"];
export default func;
