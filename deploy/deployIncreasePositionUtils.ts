import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const marketUtils = await get("MarketUtils");

  await deploy("IncreasePositionUtils", {
    from: deployer,
    log: true,
    libraries: {
      MarketUtils: marketUtils.address,
    },
  });
};
func.tags = ["IncreasePositionUtils"];
func.dependencies = ["MarketUtils"];
export default func;
