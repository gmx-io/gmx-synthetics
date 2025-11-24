import hre from "hardhat";

import { getMarketKey, getMarketTokenAddresses, getOnchainMarkets } from "../utils/market";
import { encodeData } from "../utils/hash";
import * as keys from "../utils/keys";
import { getFullKey } from "../utils/config";
import { bigNumberify } from "../utils/math";

const write = process.env.WRITE === "true";

// NOTE: it should be ensured that the market virtualTokenIdForIndexToken
// matches the on-chain value, before running this script

async function processMarketGroup({
  virtualTokenIdForIndexToken,
  markets,
  tokens,
  onchainMarketsByTokens,
  multicall,
  dataStore,
  config,
}) {
  console.log(
    `checking ${markets.length} markets for ${virtualTokenIdForIndexToken}, ${
      virtualTokenIdForIndexToken === undefined
    }`
  );

  const multicallReadParams = [];

  for (const marketConfig of markets) {
    const [indexToken, longToken, shortToken] = getMarketTokenAddresses(marketConfig, tokens);
    console.log(
      `    indexToken: ${marketConfig.tokens.indexToken}, longToken: ${marketConfig.tokens.longToken}, shortToken: ${marketConfig.tokens.shortToken}`
    );
    const marketKey = getMarketKey(indexToken, longToken, shortToken);
    const onchainMarket = onchainMarketsByTokens[marketKey];

    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getUint", [
        getFullKey(
          keys.OPEN_INTEREST_IN_TOKENS,
          encodeData(["address", "address", "bool"], [onchainMarket.marketToken, onchainMarket.longToken, true])
        ),
      ]),
    });

    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getUint", [
        getFullKey(
          keys.OPEN_INTEREST_IN_TOKENS,
          encodeData(["address", "address", "bool"], [onchainMarket.marketToken, onchainMarket.shortToken, true])
        ),
      ]),
    });

    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getUint", [
        getFullKey(
          keys.OPEN_INTEREST_IN_TOKENS,
          encodeData(["address", "address", "bool"], [onchainMarket.marketToken, onchainMarket.longToken, false])
        ),
      ]),
    });

    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getUint", [
        getFullKey(
          keys.OPEN_INTEREST_IN_TOKENS,
          encodeData(["address", "address", "bool"], [onchainMarket.marketToken, onchainMarket.shortToken, true])
        ),
      ]),
    });
  }

  const result = await multicall.callStatic.aggregate3(multicallReadParams);
  let totalLongOpenInterestInTokens = bigNumberify(0);
  let totalShortOpenInterestInTokens = bigNumberify(0);

  for (let i = 0; i < result.length; i++) {
    const value = bigNumberify(result[i].returnData);

    if (i % 4 < 2) {
      totalLongOpenInterestInTokens = totalLongOpenInterestInTokens.add(value);
    } else {
      totalShortOpenInterestInTokens = totalShortOpenInterestInTokens.add(value);
    }
  }

  const virtualInventoryInTokens = totalShortOpenInterestInTokens.sub(totalLongOpenInterestInTokens);

  console.log(`    totalLongOpenInterestInTokens: ${totalLongOpenInterestInTokens.toString()}`);
  console.log(`    totalShortOpenInterestInTokens: ${totalShortOpenInterestInTokens.toString()}`);
  console.log(`    virtualInventoryInTokens: ${virtualInventoryInTokens.toString()}`);

  if (write) {
    const tx = await config.setInt(
      keys.VIRTUAL_INVENTORY_FOR_POSITIONS_IN_TOKENS,
      virtualTokenIdForIndexToken,
      virtualInventoryInTokens
    );

    console.log("transaction sent", tx.hash);
    await tx.wait();
    console.log("receipt received");
  }
}

async function main() {
  const dataStore = await hre.ethers.getContract("DataStore");
  const config = await hre.ethers.getContract("Config");
  const multicall = await hre.ethers.getContract("Multicall3");
  const { read } = hre.deployments;

  const markets = await hre.gmx.getMarkets();
  const onchainMarketsByTokens = await getOnchainMarkets(read, dataStore.address);
  const tokens = await (hre as any).gmx.getTokens();

  const marketsByVirtualTokenId = Object.values(markets).reduce((acc, market) => {
    const key = market.virtualTokenIdForIndexToken;
    if (key === undefined) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(market);
    return acc;
  }, {});

  for (const [virtualTokenIdForIndexToken, markets] of Object.entries(marketsByVirtualTokenId)) {
    await processMarketGroup({
      virtualTokenIdForIndexToken,
      markets,
      onchainMarketsByTokens,
      tokens,
      multicall,
      dataStore,
      config,
    });
  }

  if (!write) {
    console.warn("Script ran in read-only mode, no txns were sent");
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
