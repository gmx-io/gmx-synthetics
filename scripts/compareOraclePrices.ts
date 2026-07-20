import hre from "hardhat";
import got from "got";
import { BigNumber, ethers } from "ethers";
import * as keys from "../utils/keys";

/*
Compare on-chain Chainlink prices vs Data Stream prices for a hardcoded list
of index tokens, and report the deviation in basis points.

Useful before executing a PI pool withdrawal via `chainlinkPriceFeed` to confirm
that on-chain feeds aren't materially stale vs the streaming Data Stream prices
the production keeper typically uses.

Usage:
  npx hardhat run scripts/compareOraclePrices.ts --network arbitrum

Output: a table with CL on-chain price feed (USD), data stream mid (USD), and deviation in bps.
Tokens without a registered on-chain feed are flagged.
*/

const TICKERS_URL = "https://arbitrum-api.gmxinfra2.io/prices/tickers";

const PRICE_FEED_ABI = ["function latestAnswer() view returns (int256)", "function decimals() view returns (uint8)"];

// Index tokens for the 11 markets (Arbitrum).
// `decimals` here is the GMX token-decimals used in the internal 30-decimal price scaling.
const TOKENS = [
  { symbol: "BTC", address: "0x47904963fc8b2340414262125aF798B9655E58Cd", decimals: 8 },
  { symbol: "WETH", address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", decimals: 18 },
  { symbol: "XRP", address: "0xc14e065b0067dE91534e032868f5Ac6ecf2c6868", decimals: 6 },
  { symbol: "LINK", address: "0xf97f4df75117a78c1A5a0DBb814Af92458539FB4", decimals: 18 },
  { symbol: "DOGE", address: "0xC4da4c24fd591125c3F47b340b6f4f76111883d8", decimals: 8 },
  { symbol: "VVV", address: "0xB79Eb5BA64A167676694bB41bc1640F95d309a2F", decimals: 18 },
  { symbol: "FARTCOIN", address: "0xaca341E61aB6177B0b0Df46a612e4311F8a7605f", decimals: 6 },
  { symbol: "GMX", address: "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a", decimals: 18 },
  { symbol: "ORDI", address: "0x1E15d08f3CA46853B692EE28AE9C7a0b88a9c994", decimals: 18 },
  { symbol: "ARB", address: "0x912CE59144191C1204E64559FE8253a0e49E6548", decimals: 18 },
  { symbol: "HYPE", address: "0xfDFA0A749dA3bCcee20aE0B4AD50E39B26F58f7C", decimals: 8 },
];

async function main() {
  const dataStore = await hre.ethers.getContract("DataStore");

  const tickers = (await got(TICKERS_URL).json()) as any[];
  const tickerByAddress = new Map<string, any>();
  for (const t of tickers) {
    tickerByAddress.set(t.tokenAddress.toLowerCase(), t);
  }

  console.log("Compare on-chain Price Feed vs Data Stream prices:\n");
  console.log(
    "Symbol".padEnd(12) +
      "tokDec".padEnd(8) +
      "price feed (USD)".padEnd(22) +
      "data stream mid (USD)".padEnd(22) +
      "Deviation"
  );
  console.log("-".repeat(85));

  for (const { symbol, address, decimals } of TOKENS) {
    const feed: string = await dataStore.getAddress(keys.priceFeedKey(address));

    if (feed === ethers.constants.AddressZero) {
      console.log(symbol.padEnd(12) + String(decimals).padEnd(8) + "-");
      continue;
    }

    const priceFeed = new hre.ethers.Contract(feed, PRICE_FEED_ABI, hre.ethers.provider);
    const answer: BigNumber = await priceFeed.latestAnswer();
    const feedDecimals: number = await priceFeed.decimals();
    const priceFeedUsd = parseFloat(hre.ethers.utils.formatUnits(answer, feedDecimals));

    const ticker = tickerByAddress.get(address.toLowerCase());
    if (!ticker) {
      console.log(
        symbol.padEnd(12) + String(decimals).padEnd(8) + priceFeedUsd.toFixed(6).padEnd(22) + "(no Data Stream ticker)"
      );
      continue;
    }

    // GMX internal price scaling: usdPerToken = internalPrice / 10^(30 - tokenDecimals)
    const dsMin = BigNumber.from(ticker.minPrice);
    const dsMax = BigNumber.from(ticker.maxPrice);
    const dsMinUsd = parseFloat(hre.ethers.utils.formatUnits(dsMin, 30 - decimals));
    const dsMaxUsd = parseFloat(hre.ethers.utils.formatUnits(dsMax, 30 - decimals));
    const dataStreamMidUsd = (dsMinUsd + dsMaxUsd) / 2;
    const devBps = ((priceFeedUsd - dataStreamMidUsd) / dataStreamMidUsd) * 10000;

    const sign = devBps >= 0 ? "+" : "";
    console.log(
      symbol.padEnd(12) +
        String(decimals).padEnd(8) +
        priceFeedUsd.toFixed(6).padEnd(22) +
        dataStreamMidUsd.toFixed(6).padEnd(22) +
        `${sign}${devBps.toFixed(2)} bps`
    );
  }
}

main().catch((ex) => {
  console.error(ex);
  process.exit(1);
});
