import hre from "hardhat";

import { formatAmount } from "../utils/math";
import { getMarketKey, createMarketConfigByKey } from "../utils/market";
import { performMulticall } from "../utils/multicall";
import * as keys from "../utils/keys";

function formatUsd(value) {
  // values are stored with 30 decimals of precision
  return `$${formatAmount(value, 30, 2, true)}`;
}

async function main() {
  const reader = await hre.ethers.getContract("Reader");
  const dataStore = await hre.ethers.getContract("DataStore");

  console.log("network: %s", hre.network.name);
  console.log("reading data from DataStore %s Reader %s\n", dataStore.address, reader.address);

  // map token address -> symbol (includes synthetic + archived tokens from config)
  const tokens = await hre.gmx.getTokens();
  const addressToSymbol: { [address: string]: string } = {};
  for (const [tokenSymbol, tokenConfig] of Object.entries(tokens)) {
    let address = (tokenConfig as any).address;
    if (!address) {
      address = (await hre.ethers.getContract(tokenSymbol)).address;
    }
    addressToSymbol[address.toLowerCase()] = tokenSymbol;
  }

  // market keys (index:long:short of token addresses) that are present in config/markets.ts;
  // anything on-chain that is not in this set is a hidden / deprecated market
  const marketConfigs = await hre.gmx.getMarkets();
  const configMarketByKey = createMarketConfigByKey({ marketConfigs, tokens });

  const markets = [...(await reader.getMarkets(dataStore.address, 0, 1000))];
  markets.sort((a, b) => a.indexToken.localeCompare(b.indexToken));

  // build a single multicall for all the values we need across every market
  const multicallReadParams = [];
  for (const [i, market] of markets.entries()) {
    const reads = [
      { key: keys.isMarketDisabledKey(market.marketToken), method: "getBool", label: `${i}:isDisabled` },
      // current open interest is tracked per collateral token, so sum both collateral tokens per side
      {
        key: keys.openInterestKey(market.marketToken, market.longToken, true),
        method: "getUint",
        label: `${i}:oiLongColLong`,
      },
      {
        key: keys.openInterestKey(market.marketToken, market.shortToken, true),
        method: "getUint",
        label: `${i}:oiLongColShort`,
      },
      {
        key: keys.openInterestKey(market.marketToken, market.longToken, false),
        method: "getUint",
        label: `${i}:oiShortColLong`,
      },
      {
        key: keys.openInterestKey(market.marketToken, market.shortToken, false),
        method: "getUint",
        label: `${i}:oiShortColShort`,
      },
      { key: keys.maxOpenInterestKey(market.marketToken, true), method: "getUint", label: `${i}:maxOiLong` },
      { key: keys.maxOpenInterestKey(market.marketToken, false), method: "getUint", label: `${i}:maxOiShort` },
      {
        key: keys.maxPoolUsdForDepositKey(market.marketToken, market.longToken),
        method: "getUint",
        label: `${i}:maxPoolUsdLong`,
      },
      {
        key: keys.maxPoolUsdForDepositKey(market.marketToken, market.shortToken),
        method: "getUint",
        label: `${i}:maxPoolUsdShort`,
      },
    ];
    for (const { key, method, label } of reads) {
      multicallReadParams.push({
        target: dataStore.address,
        allowFailure: false,
        callData: dataStore.interface.encodeFunctionData(method, [key]),
        label,
      });
    }
  }

  const { bigNumberResults } = await performMulticall({ multicallReadParams });

  for (const [i, market] of markets.entries()) {
    const indexSymbol = addressToSymbol[market.indexToken.toLowerCase()];
    const longSymbol = addressToSymbol[market.longToken.toLowerCase()] || market.longToken;
    const shortSymbol = addressToSymbol[market.shortToken.toLowerCase()] || market.shortToken;

    const marketKey = getMarketKey(market.indexToken, market.longToken, market.shortToken);
    const inConfig = Boolean(configMarketByKey[marketKey]);

    const isDisabled = !bigNumberResults[`${i}:isDisabled`].eq(0);
    const oiLong = bigNumberResults[`${i}:oiLongColLong`].add(bigNumberResults[`${i}:oiLongColShort`]);
    const oiShort = bigNumberResults[`${i}:oiShortColLong`].add(bigNumberResults[`${i}:oiShortColShort`]);
    const maxOiLong = bigNumberResults[`${i}:maxOiLong`];
    const maxOiShort = bigNumberResults[`${i}:maxOiShort`];
    const maxPoolUsdLong = bigNumberResults[`${i}:maxPoolUsdLong`];
    const maxPoolUsdShort = bigNumberResults[`${i}:maxPoolUsdShort`];

    const label = `${indexSymbol || "(swap only)"} [${longSymbol}-${shortSymbol}]`;
    console.log("%s%s", label, inConfig ? "" : "  <-- not in config (deprecated/hidden)");
    console.log("    market:            %s", market.marketToken);
    console.log("    isDisabled:        %s", isDisabled);
    console.log("    openInterest       longs:  %s  (raw %s)", formatUsd(oiLong), oiLong.toString());
    console.log("    openInterest       shorts: %s  (raw %s)", formatUsd(oiShort), oiShort.toString());
    console.log("    maxOpenInterest    longs:  %s  (raw %s)", formatUsd(maxOiLong), maxOiLong.toString());
    console.log("    maxOpenInterest    shorts: %s  (raw %s)", formatUsd(maxOiShort), maxOiShort.toString());
    console.log("    maxPoolUsdForDeposit long:  %s  (raw %s)", formatUsd(maxPoolUsdLong), maxPoolUsdLong.toString());
    console.log("    maxPoolUsdForDeposit short: %s  (raw %s)", formatUsd(maxPoolUsdShort), maxPoolUsdShort.toString());
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
