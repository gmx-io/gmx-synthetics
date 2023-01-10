import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const roleStore = await get("RoleStore");
  const marketEventUtils = await get("MarketEventUtils");

  await deploy("SwapHandler", {
    from: deployer,
    log: true,
    args: [roleStore.address],
    libraries: {
      MarketEventUtils: marketEventUtils.address,
    },
  });
};
func.tags = ["SwapHandler"];
func.dependencies = ["RoleStore", "MarketEventUtils"];
export default func;
