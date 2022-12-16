import { HardhatRuntimeEnvironment } from "hardhat/types";
import { grantRoleIfNotGranted } from "../utils/role";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const { address: roleStoreAddress } = await get("RoleStore");
  const { address: dataStoreAddress } = await get("DataStore");
  const { address: eventEmitterAddress } = await get("EventEmitter");
  const { address: orderStoreAddress } = await get("OrderStore");
  const { address: positionStoreAddress } = await get("PositionStore");
  const { address: marketStoreAddress } = await get("MarketStore");
  const { address: oracleAddress } = await get("Oracle");
  const { address: swapHandlerAddress } = await get("SwapHandler");
  const { address: feeReceiverAddress } = await get("FeeReceiver");
  const { address: referralStorageAddress } = await get("ReferralStorage");
  const { address: gasUtilsAddress } = await get("GasUtils");
  const { address: orderUtilsAddress } = await get("OrderUtils");
  const { address: liquidationUtilsAddress } = await get("LiquidationUtils");
  const { address: adlUtilsAddress } = await get("AdlUtils");

  const { address } = await deploy("OrderHandler", {
    from: deployer,
    log: true,
    args: [
      roleStoreAddress,
      dataStoreAddress,
      eventEmitterAddress,
      marketStoreAddress,
      orderStoreAddress,
      positionStoreAddress,
      oracleAddress,
      swapHandlerAddress,
      feeReceiverAddress,
      referralStorageAddress,
    ],
    libraries: {
      GasUtils: gasUtilsAddress,
      OrderUtils: orderUtilsAddress,
      LiquidationUtils: liquidationUtilsAddress,
      AdlUtils: adlUtilsAddress,
    },
  });

  await grantRoleIfNotGranted(address, "CONTROLLER");
  await grantRoleIfNotGranted(address, "ORDER_KEEPER");
};
func.tags = ["OrderHandler"];
func.dependencies = [
  "RoleStore",
  "DataStore",
  "EventEmitter",
  "MarketStore",
  "OrderStore",
  "PositionStore",
  "Oracle",
  "SwapHandler",
  "FeeReceiver",
  "ReferralStorage",
  "GasUtils",
  "AdlUtils",
  "LiquidationUtils",
  "OrderUtils",
];
export default func;
