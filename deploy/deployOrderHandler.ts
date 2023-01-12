import { HardhatRuntimeEnvironment } from "hardhat/types";
import { grantRoleIfNotGranted } from "../utils/role";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const roleStore = await get("RoleStore");
  const dataStore = await get("DataStore");
  const eventEmitter = await get("EventEmitter");
  const orderStore = await get("OrderStore");
  const positionStore = await get("PositionStore");
  const marketStore = await get("MarketStore");
  const oracle = await get("Oracle");
  const swapHandler = await get("SwapHandler");
  const feeReceiver = await get("FeeReceiver");
  const referralStorage = await get("ReferralStorage");
  const gasUtils = await get("GasUtils");
  const orderUtils = await get("OrderUtils");

  const { address } = await deploy("OrderHandler", {
    from: deployer,
    log: true,
    args: [
      roleStore.address,
      dataStore.address,
      eventEmitter.address,
      marketStore.address,
      orderStore.address,
      positionStore.address,
      oracle.address,
      swapHandler.address,
      feeReceiver.address,
      referralStorage.address,
    ],
    libraries: {
      GasUtils: gasUtils.address,
      OrderUtils: orderUtils.address,
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
  "OrderUtils",
];
export default func;
