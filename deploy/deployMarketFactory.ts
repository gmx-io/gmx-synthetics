import { HardhatRuntimeEnvironment } from "hardhat/types";
import { hashString } from "../utils/hash";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get, execute } = deployments;
  const { deployer } = await getNamedAccounts();

  const { address: roleStoreAddress } = await get("RoleStore");
  const { address: dataStoreAddress } = await get("DataStore");
  const { address: marketStoreAddress } = await get("MarketStore");

  const { newlyDeployed, address } = await deploy("MarketFactory", {
    from: deployer,
    log: true,
    args: [roleStoreAddress, dataStoreAddress, marketStoreAddress],
  });

  if (newlyDeployed) {
    await execute("RoleStore", { from: deployer, log: true }, "grantRole", address, hashString("CONTROLLER"));
  }
};
func.tags = ["MarketFactory"];
func.dependencies = ["RoleStore", "DataStore", "MarketStore"];
export default func;
