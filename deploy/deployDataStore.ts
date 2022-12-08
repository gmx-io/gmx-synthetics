import { HardhatRuntimeEnvironment } from "hardhat/types";
import { setUintIfDifferent } from "../utils/dataStore";
import { hashString } from "../utils/hash";
import { expandFloatDecimals } from "../utils/math";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const roleStore = await get("RoleStore");

  await deploy("DataStore", {
    from: deployer,
    log: true,
    args: [roleStore.address],
  });

  await setUintIfDifferent(hashString("MIN_ORACLE_BLOCK_CONFIRMATIONS"), 100, "min oracle block confirmations");
  await setUintIfDifferent(hashString("MAX_ORACLE_PRICE_AGE"), 5 * 60, "min oracle price age");
  await setUintIfDifferent(hashString("MAX_LEVERAGE"), expandFloatDecimals(100), "max leverage");
};
func.tags = ["DataStore"];
func.dependencies = ["RoleStore"];
export default func;
