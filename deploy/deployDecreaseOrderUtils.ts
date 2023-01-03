import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const positionStoreUtils = await get("PositionStoreUtils");
  const decreasePositionUtils = await get("DecreasePositionUtils");

  await deploy("DecreaseOrderUtils", {
    from: deployer,
    log: true,
    libraries: {
      PositionStoreUtils: positionStoreUtils.address,
      DecreasePositionUtils: decreasePositionUtils.address,
    },
  });
};
func.tags = ["DecreaseOrderUtils"];
func.dependencies = ["PositionStoreUtils", "DecreasePositionUtils"];
export default func;
