import { HardhatRuntimeEnvironment } from "hardhat/types";
import { grantRoleIfNotGranted } from "../utils/role";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const roleStore = await get("RoleStore");
  const dataStore = await get("DataStore");
  const eventEmitter = await get("EventEmitter");
  const depositStore = await get("DepositStore");
  const marketStore = await get("MarketStore");
  const oracle = await get("Oracle");
  const feeReceiver = await get("FeeReceiver");
  const depositUtils = await get("DepositUtils");
  const gasUtils = await get("GasUtils");

  const deployArgs = [
    roleStore.address,
    dataStore.address,
    eventEmitter.address,
    depositStore.address,
    marketStore.address,
    oracle.address,
    feeReceiver.address,
  ];
  const { address } = await deploy("DepositHandler", {
    from: deployer,
    log: true,
    args: deployArgs,
    libraries: {
      DepositUtils: depositUtils.address,
      GasUtils: gasUtils.address,
    },
  });

  await grantRoleIfNotGranted(address, "CONTROLLER");
};
func.tags = ["DepositHandler"];
func.dependencies = [
  "RoleStore",
  "DataStore",
  "EventEmitter",
  "DepositStore",
  "MarketStore",
  "Oracle",
  "FeeReceiver",
  "DepositUtils",
  "GasUtils",
];
export default func;
