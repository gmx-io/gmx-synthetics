import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const orderStoreUtils = await get("OrderStoreUtils");

  await deploy("SwapOrderUtils", {
    from: deployer,
    log: true,
    libraries: {
      OrderStoreUtils: orderStoreUtils.address,
    },
  });
};
func.tags = ["SwapOrderUtils"];
func.dependencies = ["OrderStoreUtils"];
export default func;
