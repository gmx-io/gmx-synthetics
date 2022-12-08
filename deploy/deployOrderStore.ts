import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const roleStore = await get("RoleStore");
  const dataStore = await get("DataStore");

  await deploy("OrderStore", {
    from: deployer,
    log: true,
    args: [roleStore.address, dataStore.address],
  });
};
func.tags = ["OrderStore"];
func.dependencies = ["RoleStore", "DataStore"];
export default func;
