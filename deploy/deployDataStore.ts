import { HardhatRuntimeEnvironment } from "hardhat/types";
import { hashString } from "../utils/hash";
import { expandFloatDecimals } from "../utils/math";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, execute, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const roleStore = await get("RoleStore");

  const result = await deploy("DataStore", {
    from: deployer,
    log: true,
    args: [roleStore.address],
  });

  async function setDataStoreUint(key, value) {
    await execute("DataStore", { from: deployer, log: true }, "setUint", hashString(key), value);
  }

  if (result.newlyDeployed) {
    await setDataStoreUint("MIN_ORACLE_BLOCK_CONFIRMATIONS", 100);
    await setDataStoreUint("MAX_ORACLE_PRICE_AGE", 5 * 60); // 5 minutes
    await setDataStoreUint("MAX_LEVERAGE", expandFloatDecimals(100));
  }
};
func.tags = ["DataStore"];
func.dependencies = ["RoleStore"];
export default func;
