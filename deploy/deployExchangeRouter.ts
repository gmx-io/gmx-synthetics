import { HardhatRuntimeEnvironment } from "hardhat/types";

import { grantRoleIfNotGranted } from "../utils/role";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const router = await get("Router");
  const roleStore = await get("RoleStore");
  const dataStore = await get("DataStore");
  const eventEmitter = await get("EventEmitter");
  const depositHandler = await get("DepositHandler");
  const withdrawalHandler = await get("WithdrawalHandler");
  const orderHandler = await get("OrderHandler");
  const marketStore = await get("MarketStore");
  const depositStore = await get("DepositStore");
  const withdrawalStore = await get("WithdrawalStore");
  const referralStorage = await get("ReferralStorage");
  const gasUtils = await get("GasUtils");
  const orderStoreUtils = await get("OrderStoreUtils");

  const deployArgs = [
    router.address,
    roleStore.address,
    dataStore.address,
    eventEmitter.address,
    depositHandler.address,
    withdrawalHandler.address,
    orderHandler.address,
    marketStore.address,
    depositStore.address,
    withdrawalStore.address,
    referralStorage.address,
  ];
  const { address } = await deploy("ExchangeRouter", {
    from: deployer,
    log: true,
    args: deployArgs,
    libraries: {
      GasUtils: gasUtils.address,
      OrderStoreUtils: orderStoreUtils.address,
    },
  });

  await grantRoleIfNotGranted(address, "CONTROLLER");
  await grantRoleIfNotGranted(address, "ROUTER_PLUGIN");
};
func.tags = ["ExchangeRouter"];
func.dependencies = [
  "Router",
  "RoleStore",
  "DataStore",
  "EventEmitter",
  "DepositHandler",
  "WithdrawalHandler",
  "OrderHandler",
  "MarketStore",
  "DepositStore",
  "WithdrawalStore",
  "ReferralStorage",
  "OrderStoreUtils",
];
export default func;
