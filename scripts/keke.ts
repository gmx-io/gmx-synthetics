import { getOracleProviderAddress, getOracleProviderKey } from "../utils/oracle";
import * as keys from "../utils/keys";

export async function main() {
  const tokens = await hre.gmx.getTokens();
  const tokenSymbols = Object.keys(tokens);
  const dataStore = await hre.ethers.getContract("DataStore");
  const oracle = await hre.ethers.getContract("Oracle");

  for (const tokenSymbol of tokenSymbols) {
    if (!tokenSymbol.startsWith("GLV")) {
      continue;
    }

    const token = tokens[tokenSymbol];
    const oracleProviderAddress = await getOracleProviderAddress(token.oracleProvider);
    const oracleProviderKey = await getOracleProviderKey(oracleProviderAddress);
    console.log(tokenSymbol, oracleProviderKey, oracleProviderAddress, "<<<");
    console.log(`setOracleProviderForToken(${tokenSymbol} ${oracleProviderKey} ${oracleProviderAddress})`);

    await dataStore.setAddress(keys.oracleProviderForTokenKey(oracle.address, token.address), oracleProviderAddress);
    await dataStore.setAddress(keys.oracleProviderForTokenKeyOld(token.address), oracleProviderAddress);
  }
}

main();
