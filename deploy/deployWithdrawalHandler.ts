import { HardhatRuntimeEnvironment } from "hardhat/types";
import { grantRoleIfNotGranted } from "../utils/role";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const roleStore = await get("RoleStore");
  const dataStore = await get("DataStore");
  const eventEmitter = await get("EventEmitter");
  const withdrawalStore = await get("WithdrawalStore");
  const marketStore = await get("MarketStore");
  const oracle = await get("Oracle");
  const feeReceiver = await get("FeeReceiver");
  const withdrawalUtils = await get("WithdrawalUtils");
  const gasUtils = await get("GasUtils");

  const { address } = await deploy("WithdrawalHandler", {
    from: deployer,
    log: true,
    args: [
      roleStore.address,
      dataStore.address,
      eventEmitter.address,
      withdrawalStore.address,
      marketStore.address,
      oracle.address,
      feeReceiver.address,
    ],
    libraries: {
      WithdrawalUtils: withdrawalUtils.address,
      GasUtils: gasUtils.address,
    },
  });

  await grantRoleIfNotGranted(address, "CONTROLLER");
};

func.tags = ["WithdrawalHandler"];
func.dependencies = [
  "RoleStore",
  "DataStore",
  "EventEmitter",
  "WithdrawalStore",
  "MarketStore",
  "Oracle",
  "FeeReceiver",
  "WithdrawalUtils",
  "GasUtils",
];
export default func;
