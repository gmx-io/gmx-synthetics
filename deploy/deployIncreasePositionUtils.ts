import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const marketUtils = await get("MarketUtils");
  const positionStoreUtils = await get("PositionStoreUtils");

  await deploy("IncreasePositionUtils", {
    from: deployer,
    log: true,
    libraries: {
      MarketUtils: marketUtils.address,
      PositionStoreUtils: positionStoreUtils.address,
    },
  });
};
func.tags = ["IncreasePositionUtils"];
func.dependencies = ["MarketUtils", "PositionStoreUtils"];
export default func;
