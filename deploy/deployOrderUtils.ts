import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const baseOrderUtils = await get("BaseOrderUtils");
  const orderStoreUtils = await get("OrderStoreUtils");
  const increaseOrderUtils = await get("IncreaseOrderUtils");
  const decreaseOrderUtils = await get("DecreaseOrderUtils");
  const swapOrderUtils = await get("SwapOrderUtils");
  const gasUtils = await get("GasUtils");

  await deploy("OrderUtils", {
    from: deployer,
    log: true,
    libraries: {
      BaseOrderUtils: baseOrderUtils.address,
      OrderStoreUtils: orderStoreUtils.address,
      IncreaseOrderUtils: increaseOrderUtils.address,
      DecreaseOrderUtils: decreaseOrderUtils.address,
      SwapOrderUtils: swapOrderUtils.address,
      GasUtils: gasUtils.address,
    },
  });
};
func.tags = ["OrderUtils"];
func.dependencies = [
  "BaseOrderUtils",
  "OrderStoreUtils",
  "IncreaseOrderUtils",
  "DecreaseOrderUtils",
  "SwapOrderUtils",
  "GasUtils",
];
export default func;
