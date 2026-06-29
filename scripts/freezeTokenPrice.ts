import hre from "hardhat";
import prompts from "prompts";

import * as keys from "../utils/keys";
import { fetchSignedPrices } from "../utils/prices";

const { ethers } = hre as any;

type Market = {
  marketToken: string;
  indexToken: string;
  longToken: string;
  shortToken: string;
};

type TokenInfo = {
  address: string;
  symbol: string;
};

function toLower(address: string) {
  return address.toLowerCase();
}

function sameAddress(a: string, b: string) {
  return toLower(a) === toLower(b);
}

function formatMarket(market: Market, tokenSymbolsByAddress: Record<string, string>) {
  const indexSymbol = tokenSymbolsByAddress[toLower(market.indexToken)] || market.indexToken;
  const longSymbol = tokenSymbolsByAddress[toLower(market.longToken)] || market.longToken;
  const shortSymbol = tokenSymbolsByAddress[toLower(market.shortToken)] || market.shortToken;

  return `${market.marketToken} (${indexSymbol}/${longSymbol}/${shortSymbol})`;
}

function getTokenRoles(market: Market, token: string) {
  const roles: string[] = [];

  if (sameAddress(market.indexToken, token)) {
    roles.push("indexToken");
  }

  if (sameAddress(market.longToken, token)) {
    roles.push("longToken");
  }

  if (sameAddress(market.shortToken, token)) {
    roles.push("shortToken");
  }

  return roles;
}

async function getTokenSymbolsByAddress() {
  const tokens = await (hre as any).gmx.getTokens();
  const tokenSymbolsByAddress: Record<string, string> = {};

  for (const [symbol, tokenConfig] of Object.entries(tokens) as any) {
    let address = tokenConfig.address;

    if (!address) {
      try {
        address = (await ethers.getContract(symbol)).address;
      } catch (e) {
        continue;
      }
    }

    tokenSymbolsByAddress[toLower(address)] = symbol;
  }

  return tokenSymbolsByAddress;
}

async function resolveToken(): Promise<TokenInfo> {
  let token = process.env.TOKEN;

  if (!token) {
    ({ token } = await prompts({
      type: "text",
      name: "token",
      message: "Enter token address or token symbol to freeze",
    }));
  }

  if (!token) {
    throw new Error("TOKEN is required");
  }

  if (ethers.utils.isAddress(token)) {
    return {
      address: ethers.utils.getAddress(token),
      symbol: token,
    };
  }

  const tokens = await (hre as any).gmx.getTokens();
  const tokenEntry = Object.entries(tokens).find(([symbol]) => symbol.toLowerCase() === token!.toLowerCase());

  if (!tokenEntry) {
    throw new Error(`Unknown token symbol: ${token}`);
  }

  const [symbol, tokenConfig] = tokenEntry as any;
  let address = tokenConfig.address;

  if (!address) {
    address = (await ethers.getContract(symbol)).address;
  }

  return {
    address: ethers.utils.getAddress(address),
    symbol,
  };
}

async function getMarkets(dataStore: any, reader: any): Promise<Market[]> {
  const marketCount = (await dataStore.getAddressCount(keys.MARKET_LIST)).toNumber();
  return [...(await reader.getMarkets(dataStore.address, 0, marketCount))];
}

async function isMarketDisabled(dataStore: any, market: Market) {
  return await dataStore.getBool(keys.isMarketDisabledKey(market.marketToken));
}

async function getOracleParams(token: TokenInfo) {
  const chainlinkDataStreamProvider = await ethers.getContract("ChainlinkDataStreamProvider");
  const signedPrices = await fetchSignedPrices();
  const signedPrice = signedPrices[toLower(token.address)];

  if (!signedPrice) {
    throw new Error(`No signed price found for ${token.symbol} (${token.address})`);
  }

  return {
    params: {
      tokens: [token.address],
      providers: [chainlinkDataStreamProvider.address],
      data: [signedPrice.blob],
    },
    signedPrice,
    provider: chainlinkDataStreamProvider.address,
  };
}

async function validateMarketUsage({
  dataStore,
  markets,
  token,
  tokenSymbolsByAddress,
}: {
  dataStore: any;
  markets: Market[];
  token: TokenInfo;
  tokenSymbolsByAddress: Record<string, string>;
}) {
  const indexMarkets = markets.filter((market) => sameAddress(market.indexToken, token.address));

  if (indexMarkets.length !== 1) {
    console.error(`Expected ${token.symbol} (${token.address}) to be the indexToken of exactly one market.`);
    console.error(`Found ${indexMarkets.length} index markets:`);
    for (const market of indexMarkets) {
      console.error(`  - ${formatMarket(market, tokenSymbolsByAddress)}`);
    }
    throw new Error("Token is not isolated to a single index market");
  }

  const targetMarket = indexMarkets[0];
  const enabledConflicts: Array<{ market: Market; roles: string[] }> = [];
  const disabledUsages: Array<{ market: Market; roles: string[] }> = [];

  for (const market of markets) {
    const roles = getTokenRoles(market, token.address);

    if (roles.length === 0 || sameAddress(market.marketToken, targetMarket.marketToken)) {
      continue;
    }

    if (await isMarketDisabled(dataStore, market)) {
      disabledUsages.push({ market, roles });
      continue;
    }

    enabledConflicts.push({ market, roles });
  }

  if (enabledConflicts.length > 0) {
    console.error(`${token.symbol} (${token.address}) is used by other enabled markets:`);
    for (const conflict of enabledConflicts) {
      console.error(`  - ${formatMarket(conflict.market, tokenSymbolsByAddress)} as ${conflict.roles.join(", ")}`);
    }
    throw new Error("Token is used by another enabled market");
  }

  return {
    targetMarket,
    disabledUsages,
  };
}

async function validateGlvUsage({
  dataStore,
  reader,
  targetMarket,
  token,
  tokenSymbolsByAddress,
}: {
  dataStore: any;
  reader: any;
  targetMarket: Market;
  token: TokenInfo;
  tokenSymbolsByAddress: Record<string, string>;
}) {
  const glvCount = (await dataStore.getAddressCount(keys.GLV_LIST)).toNumber();
  const glvs = await dataStore.getAddressValuesAt(keys.GLV_LIST, 0, glvCount);
  const conflicts: Array<{ glv: string; market: Market; roles: string[] }> = [];
  const targetGlvUsages: string[] = [];

  for (const glv of glvs) {
    const glvMarketsKey = keys.glvSupportedMarketListKey(glv);
    const glvMarketCount = (await dataStore.getAddressCount(glvMarketsKey)).toNumber();
    const glvMarkets = await dataStore.getAddressValuesAt(glvMarketsKey, 0, glvMarketCount);

    for (const marketAddress of glvMarkets) {
      const isGlvMarketDisabled = await dataStore.getBool(keys.isGlvMarketDisabledKey(glv, marketAddress));
      if (isGlvMarketDisabled) {
        continue;
      }

      const market = await reader.getMarket(dataStore.address, marketAddress);

      if (sameAddress(market.marketToken, targetMarket.marketToken)) {
        targetGlvUsages.push(glv);
        continue;
      }

      const roles = getTokenRoles(market, token.address);
      if (roles.length > 0) {
        conflicts.push({ glv, market, roles });
      }
    }
  }

  if (conflicts.length > 0) {
    console.error(`${token.symbol} (${token.address}) is used by enabled GLV markets outside the target market:`);
    for (const conflict of conflicts) {
      console.error(
        `  - GLV ${conflict.glv}: ${formatMarket(conflict.market, tokenSymbolsByAddress)} as ${conflict.roles.join(
          ", "
        )}`
      );
    }
    throw new Error("Token is used by an enabled GLV market outside the target market");
  }

  return {
    glvCount,
    targetGlvUsages,
  };
}

async function main() {
  const config = await ethers.getContract("Config");
  const dataStore = await ethers.getContract("DataStore");
  const reader = await ethers.getContract("Reader");

  const [token, tokenSymbolsByAddress] = await Promise.all([resolveToken(), getTokenSymbolsByAddress()]);
  token.symbol = tokenSymbolsByAddress[toLower(token.address)] || token.symbol;

  const markets = await getMarkets(dataStore, reader);
  const { targetMarket, disabledUsages } = await validateMarketUsage({
    dataStore,
    markets,
    token,
    tokenSymbolsByAddress,
  });
  const { glvCount, targetGlvUsages } = await validateGlvUsage({
    dataStore,
    reader,
    targetMarket,
    token,
    tokenSymbolsByAddress,
  });
  const { params: pricesParams, signedPrice, provider } = await getOracleParams(token);

  console.log("=".repeat(80));
  console.log("Freeze Token Price");
  console.log("=".repeat(80));
  console.log(`Network:             ${hre.network.name}`);
  console.log(`Config:              ${config.address}`);
  console.log(`Token:               ${token.symbol} (${token.address})`);
  console.log(`Target market:       ${formatMarket(targetMarket, tokenSymbolsByAddress)}`);
  console.log(`Oracle provider:     ${provider}`);
  console.log(`Signed price min:    ${signedPrice.min.toString()}`);
  console.log(`Signed price max:    ${signedPrice.max.toString()}`);
  console.log(`Markets scanned:     ${markets.length}`);
  console.log(`GLVs scanned:        ${glvCount}`);
  console.log(`Target market GLVs:  ${targetGlvUsages.length ? targetGlvUsages.join(", ") : "none"}`);

  if (disabledUsages.length > 0) {
    console.log("Disabled non-target market usages found and ignored:");
    for (const usage of disabledUsages) {
      console.log(`  - ${formatMarket(usage.market, tokenSymbolsByAddress)} as ${usage.roles.join(", ")}`);
    }
  }

  console.log("=".repeat(80));
  console.log("Consequences:");
  console.log(`  - This will store the current oracle min/max price as the static price for ${token.symbol}.`);
  console.log(
    `  - This will switch the required oracle provider for ${token.symbol} to StaticOracleProvider globally.`
  );
  console.log("  - Future non-atomic oracle validations for this token will require the static oracle provider.");
  console.log("  - The script verified that no other enabled market or enabled non-target GLV market uses this token.");
  console.log("  - The target market should be part of the intended closure process before proceeding.");
  console.log("=".repeat(80));

  if (process.env.SKIP_CONFIRMATION !== "true") {
    const { confirmation } = await prompts({
      type: "text",
      name: "confirmation",
      message: `Type FREEZE ${token.symbol} to call setStaticPriceForMarketIndexToken`,
    });

    if (confirmation !== `FREEZE ${token.symbol}`) {
      console.log("Confirmation did not match. Aborting without sending a transaction.");
      return;
    }
  }

  const tx = await config.setStaticPriceForMarketIndexToken(targetMarket.marketToken, pricesParams);
  console.log(`Transaction sent: ${tx.hash}`);

  const receipt = await tx.wait();
  console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
  console.log(`Gas used: ${receipt.gasUsed.toString()}`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
