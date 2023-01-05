import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const depositStoreUtils = await get("DepositStoreUtils");
  const positionStoreUtils = await get("PositionStoreUtils");
  const orderStoreUtils = await get("OrderStoreUtils");

  await deploy("Reader", {
    from: deployer,
    log: true,
    libraries: {
      DepositStoreUtils: depositStoreUtils.address,
      PositionStoreUtils: positionStoreUtils.address,
      OrderStoreUtils: orderStoreUtils.address,
    },
  });
};
func.tags = ["Reader"];
func.dependencies = ["DepositStoreUtils", "PositionStoreUtils", "OrderStoreUtils"];
export default func;
