import { HardhatRuntimeEnvironment } from "hardhat/types";
import { hashString } from "../utils/hash";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get, execute } = deployments;
  const { deployer } = await getNamedAccounts();

  const { address: roleStoreAddress } = await get("RoleStore");
  const { address: dataStoreAddress } = await get("DataStore");
  const { address: eventEmitterAddress } = await get("EventEmitter");
  const { address: depositStoreAddress } = await get("DepositStore");
  const { address: marketStoreAddress } = await get("MarketStore");
  const { address: oracleAddress } = await get("Oracle");
  const { address: feeReceiverAddress } = await get("FeeReceiver");
  const { address: gasUtilsAddress } = await get("GasUtils");

  const deployArgs = [
    roleStoreAddress,
    dataStoreAddress,
    eventEmitterAddress,
    depositStoreAddress,
    marketStoreAddress,
    oracleAddress,
    feeReceiverAddress,
  ];
  const { address, newlyDeployed } = await deploy("DepositHandler", {
    from: deployer,
    log: true,
    args: deployArgs,
    libraries: {
      GasUtils: gasUtilsAddress,
    },
  });

  if (newlyDeployed) {
    await execute("RoleStore", { from: deployer, log: true }, "grantRole", address, hashString("CONTROLLER"));
  }
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
  "GasUtils",
];
export default func;
