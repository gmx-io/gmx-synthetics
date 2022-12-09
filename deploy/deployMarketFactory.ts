import { HardhatRuntimeEnvironment } from "hardhat/types";
import { grantRoleIfNotGranted } from "../utils/role";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const { address: roleStoreAddress } = await get("RoleStore");
  const { address: dataStoreAddress } = await get("DataStore");
  const { address: marketStoreAddress } = await get("MarketStore");

  const { address } = await deploy("MarketFactory", {
    from: deployer,
    log: true,
    args: [roleStoreAddress, dataStoreAddress, marketStoreAddress],
  });

  grantRoleIfNotGranted(address, "CONTROLLER");
};
func.tags = ["MarketFactory"];
func.dependencies = ["RoleStore", "DataStore", "MarketStore"];
export default func;
