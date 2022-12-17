import { HardhatRuntimeEnvironment } from "hardhat/types";
import { grantRoleIfNotGranted } from "../utils/role";
import { setUintIfDifferent } from "../utils/dataStore";
import * as keys from "../utils/keys";

const func = async ({ getNamedAccounts, deployments, gmx }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();
  const oracleConfig = await gmx.getOracle();

  const { address: roleStoreAddress } = await get("RoleStore");
  const { address: oracleStoreAddress } = await get("OracleStore");

  const { address } = await deploy("Oracle", {
    from: deployer,
    log: true,
    args: [roleStoreAddress, oracleStoreAddress],
  });

  await setUintIfDifferent(
    keys.MIN_ORACLE_BLOCK_CONFIRMATIONS,
    oracleConfig.minOracleBlockConfirmations,
    "min oracle block confirmations"
  );
  await setUintIfDifferent(keys.MAX_ORACLE_PRICE_AGE, oracleConfig.maxOraclePriceAge, "max oracle price age");
  await grantRoleIfNotGranted(address, "CONTROLLER");
};
func.tags = ["Oracle"];
func.dependencies = ["RoleStore", "OracleStore", "Tokens"];
export default func;
