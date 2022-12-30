import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const { address: marketUtils } = await get("MarketUtils");

  await deploy("PositionUtils", {
    from: deployer,
    log: true,
    libraries: {
      MarketUtils: marketUtils,
    },
  });
};
func.tags = ["PositionUtils"];
func.dependencies = ["MarketUtils"];
export default func;
