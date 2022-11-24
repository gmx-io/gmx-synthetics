import { HardhatRuntimeEnvironment } from "hardhat/types";
import { hashString } from "../utils/hash";
import * as keys from "../utils/keys";
import { expandFloatDecimals } from "../utils/math";

const func = async ({ getNamedAccounts, deployments, gmx }: HardhatRuntimeEnvironment) => {
  const { deploy, execute, get } = deployments;
  const { deployer } = await getNamedAccounts();
  const { tokens } = gmx;

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
    await setDataStoreUint("MAX_ORACLE_BLOCK_AGE", 200);
    await setDataStoreUint("MAX_LEVERAGE", expandFloatDecimals(100));

    const wrappedAddress = Object.values(tokens).find((token) => token.wrappedNative)?.address;

    await execute("DataStore", { from: deployer, log: true }, "setAddress", keys.WNT, wrappedAddress);
  }
};
func.tags = ["DataStore"];
func.dependencies = ["RoleStore", "Tokens"];
export default func;
