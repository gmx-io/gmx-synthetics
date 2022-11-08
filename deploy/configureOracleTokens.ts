import { expandDecimals } from "../utils/math";
import { hashData } from "../utils/hash";

const func = async ({ getNamedAccounts, deployments, gmx }) => {
  const { execute, read } = deployments;
  const { deployer } = await getNamedAccounts();
  const { tokens } = gmx;

  // network.config.tokens.address values are updated in runtime for non-live networks
  // instead of being configured in hardhat.config.js
  for (const token of Object.values(tokens)) {
    const key = hashData(["string", "address"], ["ORACLE_PRECISION", token.address]);
    const value = expandDecimals(1, token.oraclePrecision);
    if (!(await read("DataStore", "getUint", key)).eq(value)) {
      await execute("DataStore", { from: deployer, log: true }, "setUint", key, value);
    }
  }
};
func.tags = ["OracleTokens"];
func.dependencies = ["Oracle", "OracleStore", "DataStore", "Tokens"];
export default func;
