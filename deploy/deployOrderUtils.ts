import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const { address: orderBaseUtilsAddress } = await get("OrderBaseUtils");
  const { address: orderEventUtilsAddress } = await get("OrderEventUtils");
  const { address: increaseOrderUtilsAddress } = await get("IncreaseOrderUtils");
  const { address: decreaseOrderUtilsAddress } = await get("DecreaseOrderUtils");
  const { address: swapOrderUtilsAddress } = await get("SwapOrderUtils");
  const { address: gasUtilsAddress } = await get("GasUtils");

  await deploy("OrderUtils", {
    from: deployer,
    log: true,
    libraries: {
      OrderBaseUtils: orderBaseUtilsAddress,
      OrderEventUtils: orderEventUtilsAddress,
      IncreaseOrderUtils: increaseOrderUtilsAddress,
      DecreaseOrderUtils: decreaseOrderUtilsAddress,
      SwapOrderUtils: swapOrderUtilsAddress,
      GasUtils: gasUtilsAddress,
    },
  });
};
func.tags = ["OrderUtils"];
func.dependencies = [
  "OrderBaseUtils",
  "OrderEventUtils",
  "IncreaseOrderUtils",
  "DecreaseOrderUtils",
  "SwapOrderUtils",
  "GasUtils",
];
export default func;
