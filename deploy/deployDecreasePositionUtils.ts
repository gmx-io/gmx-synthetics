import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const marketUtils = await get("MarketUtils");
  const decreasePositionCollateralUtils = await get("DecreasePositionCollateralUtils");

  await deploy("DecreasePositionUtils", {
    from: deployer,
    log: true,
    libraries: {
      MarketUtils: marketUtils.address,
      DecreasePositionCollateralUtils: decreasePositionCollateralUtils.address,
    },
  });
};
func.tags = ["DecreasePositionUtils"];
func.dependencies = ["MarketUtils", "DecreasePositionCollateralUtils"];
export default func;
