import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const positionStoreUtils = await get("PositionStoreUtils");
  const orderStoreUtils = await get("OrderStoreUtils");

  await deploy("Reader", {
    from: deployer,
    log: true,
    libraries: {
      PositionStoreUtils: positionStoreUtils.address,
      OrderStoreUtils: orderStoreUtils.address,
    },
  });
};
func.tags = ["Reader"];
func.dependencies = ["PositionStoreUtils", "OrderStoreUtils"];
export default func;
