import { HardhatRuntimeEnvironment } from "hardhat/types";
import { grantRoleIfNotGranted } from "../utils/role";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const roleStore = await get("RoleStore");
  const dataStore = await get("DataStore");
  const eventEmitter = await get("EventEmitter");
  const marketStore = await get("MarketStore");
  const orderVault = await get("OrderVault");
  const oracle = await get("Oracle");
  const swapHandler = await get("SwapHandler");
  const feeReceiver = await get("FeeReceiver");
  const referralStorage = await get("ReferralStorage");
  const gasUtils = await get("GasUtils");
  const orderUtils = await get("OrderUtils");
  const adlUtils = await get("AdlUtils");
  const positionStoreUtils = await get("PositionStoreUtils");
  const orderStoreUtils = await get("OrderStoreUtils");

  const { address } = await deploy("AdlHandler", {
    from: deployer,
    log: true,
    args: [
      roleStore.address,
      dataStore.address,
      eventEmitter.address,
      marketStore.address,
      orderVault.address,
      oracle.address,
      swapHandler.address,
      feeReceiver.address,
      referralStorage.address,
    ],
    libraries: {
      GasUtils: gasUtils.address,
      OrderUtils: orderUtils.address,
      AdlUtils: adlUtils.address,
      PositionStoreUtils: positionStoreUtils.address,
      OrderStoreUtils: orderStoreUtils.address,
    },
  });

  await grantRoleIfNotGranted(address, "CONTROLLER");
  await grantRoleIfNotGranted(address, "ORDER_KEEPER");
};
func.tags = ["AdlHandler"];
func.dependencies = [
  "RoleStore",
  "DataStore",
  "EventEmitter",
  "MarketStore",
  "OrderVault",
  "Oracle",
  "SwapHandler",
  "FeeReceiver",
  "ReferralStorage",
  "GasUtils",
  "AdlUtils",
  "OrderUtils",
  "PositionStoreUtils",
  "OrderStoreUtils",
];
export default func;
