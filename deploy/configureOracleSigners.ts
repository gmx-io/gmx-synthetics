import { ethers } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

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
};
func.tags = ["OracleSigners"];
func.dependencies = ["RoleStore", "OracleStore"];
export default func;
