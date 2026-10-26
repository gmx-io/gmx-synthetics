import hre from "hardhat";
import { ethers } from "ethers";
import { DEFAULT_MARKET_TYPE } from "../utils/market";
import { getSyntheticTokenAddress } from "../utils/token";

// Predicts the marketToken address that `MarketFactory.createMarket` would produce,
// without sending a transaction, by using `callStatic.createMarket`.
//
// Unlike scripts/createMarket.ts this does NOT require the market (and its tokens)
// to be declared in the config. Tokens are resolved in the following order:
//   1. token present in the config           -> tokens[symbol].address
//   2. env override <SYMBOL>_ADDRESS=0x...    -> used as-is (e.g. a real, not-yet-configured ERC20)
//   3. otherwise                             -> treated as a synthetic token,
//                                               address = getSyntheticTokenAddress(chainId, symbol)
//
// There is no on-chain registry mapping a symbol to a real token address, so a real
// (non-synthetic) token that is not in the config MUST be passed via <SYMBOL>_ADDRESS.
//
// Note: createMarket is `onlyMarketKeeper`, so the static call is made from a MARKET_KEEPER
// address (default 0xD5F8b9ba4255B2F73b06f245fcca73D114D1D460, override with FROM=0x...).
//
// Usage:
//   MARKET_KEY=SPCX:WETH:USDC npx hardhat run --network <network> scripts/getMarketTokenAddress.ts
//   MARKET_KEY=SOMECOIN:WETH:USDC SOMECOIN_ADDRESS=0x... npx hardhat run --network <network> scripts/getMarketTokenAddress.ts
//   SWAP_ONLY=true MARKET_KEY=WETH:USDC npx hardhat run --network <network> scripts/getMarketTokenAddress.ts

function resolveTokenAddress(symbol: string, tokens: Record<string, any>, chainId: number) {
  if (tokens[symbol]) {
    return { address: tokens[symbol].address, source: "config" };
  }

  const override = process.env[`${symbol}_ADDRESS`];
  if (override) {
    return { address: ethers.utils.getAddress(override), source: "env override" };
  }

  // not in config and no explicit address => assume it is a synthetic token,
  // whose address is deterministically derived from chainId + symbol
  return { address: getSyntheticTokenAddress(chainId, symbol), source: "synthetic (derived)" };
}

async function main() {
  const marketFactory = await hre.ethers.getContract("MarketFactory");
  const tokens = await hre.gmx.getTokens();
  const chainId = hre.network.config.chainId;

  if (!chainId) {
    throw new Error("chainId is not configured for the selected network");
  }

  // marketKey should be of the form indexToken:longToken:shortToken
  // or if SWAP_ONLY=true, then marketKey should be in the form longToken:shortToken
  const marketKey = process.env.MARKET_KEY;

  if (!marketKey) {
    throw new Error("MARKET_KEY is empty");
  }

  const swapOnly = process.env.SWAP_ONLY === "true";

  const tokenSymbols = marketKey.split(":");

  if (swapOnly) {
    if (tokenSymbols.length !== 2) {
      throw new Error("Invalid MARKET_KEY, expected longToken:shortToken");
    }
  } else {
    if (tokenSymbols.length !== 3) {
      throw new Error("Invalid MARKET_KEY, expected indexToken:longToken:shortToken");
    }
  }

  const indexTokenSymbol = swapOnly ? undefined : tokenSymbols[0];
  const longTokenSymbol = swapOnly ? tokenSymbols[0] : tokenSymbols[1];
  const shortTokenSymbol = swapOnly ? tokenSymbols[1] : tokenSymbols[2];

  const indexToken = swapOnly
    ? { address: ethers.constants.AddressZero, source: "swapOnly (zero)" }
    : resolveTokenAddress(indexTokenSymbol, tokens, chainId);
  const longToken = resolveTokenAddress(longTokenSymbol, tokens, chainId);
  const shortToken = resolveTokenAddress(shortTokenSymbol, tokens, chainId);

  console.info("resolved tokens:");
  console.info(`  indexToken (${indexTokenSymbol ?? "-"}): ${indexToken.address} [${indexToken.source}]`);
  console.info(`  longToken  (${longTokenSymbol}): ${longToken.address} [${longToken.source}]`);
  console.info(`  shortToken (${shortTokenSymbol}): ${shortToken.address} [${shortToken.source}]`);
  console.info(`  marketType: ${DEFAULT_MARKET_TYPE}`);

  // createMarket is onlyMarketKeeper, so the static call must come from a MARKET_KEEPER.
  // eth_call accepts a `from` override without a signature, so no impersonation is needed.
  const from = process.env.FROM || "0xD5F8b9ba4255B2F73b06f245fcca73D114D1D460";
  console.info(`  from (MARKET_KEEPER): ${from}`);

  // connect to the provider (not a signer) so the `from` override is allowed in ethers v5
  const { marketToken } = await marketFactory
    .connect(hre.ethers.provider)
    .callStatic.createMarket(indexToken.address, longToken.address, shortToken.address, DEFAULT_MARKET_TYPE, { from });

  console.log(`\nmarketToken: ${marketToken}`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
