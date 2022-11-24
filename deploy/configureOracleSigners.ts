import { ethers } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import * as keys from "../utils/keys";

const func = async ({ deployments, getNamedAccounts, gmx }: HardhatRuntimeEnvironment) => {
  const { read, execute, log } = deployments;
  const { deployer } = await getNamedAccounts();
  const { oracle } = gmx;
  const oracleSigners = oracle.signers.map((s) => ethers.utils.getAddress(s));

  const existingSignersCount = await read("OracleStore", "getSignerCount");
  const existingSigners = await read("OracleStore", "getSigners", 0, existingSignersCount);
  log("existing signers", existingSigners);

  for (const oracleSigner of oracleSigners) {
    if (!existingSigners.includes(oracleSigner)) {
      log("adding oracle signer", oracleSigner);
      await execute("OracleStore", { from: deployer, log: true }, "addSigner", oracleSigner);
    }
  }

  for (const existingSigner of existingSigners) {
    if (!oracleSigners.includes(existingSigner)) {
      log("removing oracle signer", existingSigner);
      await execute("OracleStore", { from: deployer, log: true }, "removeSigner", existingSigner);
    }
  }

  const currentMinOracleSigners: ethers.BigNumber = await read("DataStore", "getUint", keys.MIN_ORACLE_SIGNERS);
  const minOracleSigners = oracle.minOracleSigners;
  if (!currentMinOracleSigners.eq(minOracleSigners)) {
    log("setting min oracle signers", minOracleSigners);
    await execute("DataStore", { from: deployer, log: true }, "setUint", keys.MIN_ORACLE_SIGNERS, minOracleSigners);
  }
};
func.tags = ["OracleSigners"];
func.dependencies = ["RoleStore", "OracleStore", "DataStore"];
export default func;
