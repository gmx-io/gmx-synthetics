import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const positionStoreUtils = await get("PositionStoreUtils");
  const increasePositionUtils = await get("IncreasePositionUtils");
  const orderStoreUtils = await get("OrderStoreUtils");

  await deploy("IncreaseOrderUtils", {
    from: deployer,
    log: true,
    libraries: {
      PositionStoreUtils: positionStoreUtils.address,
      IncreasePositionUtils: increasePositionUtils.address,
      OrderStoreUtils: orderStoreUtils.address,
    },
  });
};
func.tags = ["IncreaseOrderUtils"];
func.dependencies = ["PositionStoreUtils", "IncreasePositionUtils", "OrderStoreUtils"];
export default func;
