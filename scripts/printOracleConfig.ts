import hre from "hardhat";

import * as keys from "../utils/keys";

async function main() {
  const tokens = await hre.gmx.getTokens();
  const dataStore = await hre.ethers.getContract("DataStore");

  for (const [tokenSymbol, tokenConfig] of Object.entries(tokens)) {
    let tokenAddress = tokenConfig.address;
    if (!tokenAddress) {
      tokenAddress = (await hre.ethers.getContract(tokenSymbol)).address;
    }

    const oracleProviderForTokenKey = keys.oracleProviderForTokenKey(tokenAddress);
    const oracleTypeKey = keys.oracleTypeKey(tokenAddress);
    const priceFeedKey = keys.priceFeedKey(tokenAddress);

    const [oracleProviderForToken, oracleType, priceFeed] = await Promise.all([
      dataStore.getAddress(oracleProviderForTokenKey),
      dataStore.getBytes32(oracleTypeKey),
      dataStore.getAddress(priceFeedKey),
    ]);

    console.log(
      "%s %s oracleType: %s priceFeed: %s oracleProviderForToken: %s",
      tokenSymbol.padEnd(5),
      tokenAddress,
      oracleType,
      priceFeed,
      oracleProviderForToken
    );
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
