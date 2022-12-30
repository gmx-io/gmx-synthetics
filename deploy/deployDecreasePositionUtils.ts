import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const { address: marketUtilsAddress } = await get("MarketUtils");
  const { address: decreasePositionCollateralUtilsAddress } = await get("DecreasePositionCollateralUtils");

  await deploy("DecreasePositionUtils", {
    from: deployer,
    log: true,
    libraries: {
      MarketUtils: marketUtilsAddress,
      DecreasePositionCollateralUtils: decreasePositionCollateralUtilsAddress,
    },
  });
};
func.tags = ["DecreasePositionUtils"];
func.dependencies = ["MarketUtils", "DecreasePositionCollateralUtils"];
export default func;
