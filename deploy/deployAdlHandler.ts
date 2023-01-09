import { HardhatRuntimeEnvironment } from "hardhat/types";
import { setBoolIfDifferent } from "../utils/dataStore";
import { grantRoleIfNotGranted } from "../utils/role";
import * as keys from "../utils/keys";

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
  const adlUtils = await get("AdlUtils");

  const { address } = await deploy("AdlHandler", {
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
      AdlUtils: adlUtils.address,
    },
  });

  await grantRoleIfNotGranted(address, "CONTROLLER");
  await grantRoleIfNotGranted(address, "ORDER_KEEPER");

  await setBoolIfDifferent(keys.executeAdlFeatureKey(address, 4), true, `ADL feature for ${address}`);
};
func.tags = ["AdlHandler"];
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
  "OrderUtils",
];
export default func;
