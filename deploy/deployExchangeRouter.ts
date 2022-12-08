import { HardhatRuntimeEnvironment } from "hardhat/types";

import { hashString } from "../utils/hash";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get, execute } = deployments;
  const { deployer } = await getNamedAccounts();

  const router = await get("Router");
  const roleStore = await get("RoleStore");
  const dataStore = await get("DataStore");
  const eventEmitter = await get("EventEmitter");
  const depositHandler = await get("DepositHandler");
  const withdrawalHandler = await get("WithdrawalHandler");
  const orderHandler = await get("OrderHandler");
  const depositStore = await get("DepositStore");
  const withdrawalStore = await get("WithdrawalStore");
  const orderStore = await get("OrderStore");
  const referralStorage = await get("ReferralStorage");
  const gasUtils = await get("GasUtils");
  const orderUtils = await get("OrderUtils");

  const deployArgs = [
    router.address,
    roleStore.address,
    dataStore.address,
    eventEmitter.address,
    depositHandler.address,
    withdrawalHandler.address,
    orderHandler.address,
    depositStore.address,
    withdrawalStore.address,
    orderStore.address,
    referralStorage.address,
  ];
  const { address, newlyDeployed } = await deploy("ExchangeRouter", {
    from: deployer,
    log: true,
    args: deployArgs,
    libraries: {
      GasUtils: gasUtils.address,
      OrderUtils: orderUtils.address,
    },
  });

  if (newlyDeployed) {
    await execute("RoleStore", { from: deployer, log: true }, "grantRole", address, hashString("ROUTER_PLUGIN"));
    await execute("RoleStore", { from: deployer, log: true }, "grantRole", address, hashString("CONTROLLER"));
  }
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
  "DepositStore",
  "WithdrawalStore",
  "OrderStore",
  "ReferralStorage",
];
export default func;
