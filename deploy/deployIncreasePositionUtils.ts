import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const { address: marketUtilsAddress } = await get("MarketUtils");
  const { address: positionUtilsAddress } = await get("PositionUtils");

  await deploy("IncreasePositionUtils", {
    from: deployer,
    log: true,
    libraries: {
      MarketUtils: marketUtilsAddress,
      PositionUtils: positionUtilsAddress,
    },
  });
};
func.tags = ["IncreasePositionUtils"];
func.dependencies = ["MarketUtils", "PositionUtils"];
export default func;
