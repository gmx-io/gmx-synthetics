import hre from "hardhat";
import got from "got";
import { expandDecimals, decimalToFloat, bigNumberify } from "../utils/math";
import { OrderType, DecreasePositionSwapType } from "../utils/order";
import { contractAt } from "../utils/deploy";
import * as keys from "../utils/keys";
import { ethers } from "ethers";

// Usage:
// - COLLATERAL_AMOUNT_USD: For stablecoins (USDC/USDT/DAI), this is USD value. For other tokens, this is token amount (default: 2)
// - LEVERAGE: Leverage multiplier (default: 2)
// - COLLATERAL_TOKEN: Token symbol for collateral (default: "USDC")
// - MARKETS: Comma-separated market addresses (if empty, creates orders for all markets)
// - ACCOUNT_KEY: Private key for signing (required)
//
// Examples:
// With USDC (interpreted as $2 USD):
// MARKETS=0x70d95587d40A2caf56bd97485aB3Eec10Bee6336 COLLATERAL_AMOUNT_USD=2 ACCOUNT_KEY=0x... npx hardhat run --network arbitrum scripts/createSmallOrders.ts
//
// With WETH (interpreted as 0.001 WETH):
// MARKETS=0x70d95587d40A2caf56bd97485aB3Eec10Bee6336 COLLATERAL_AMOUNT_USD=0.001 COLLATERAL_TOKEN=WETH ACCOUNT_KEY=0x... npx hardhat run --network arbitrum scripts/createSmallOrders.ts

async function getMarketPrices(market: any): Promise<any> {
  const tickersUrl = "https://arbitrum-api.gmxinfra2.io/prices/tickers";
  const tickers = (await got(tickersUrl).json()) as any[];

  const indexTicker = tickers.find((t) => t.tokenAddress.toLowerCase() === market.indexToken.toLowerCase());
  const longTicker = tickers.find((t) => t.tokenAddress.toLowerCase() === market.longToken.toLowerCase());
  const shortTicker = tickers.find((t) => t.tokenAddress.toLowerCase() === market.shortToken.toLowerCase());

  // Check for missing prices and fail if any are not found
  const missingPrices: string[] = [];
  if (!indexTicker && market.indexToken !== ethers.constants.AddressZero) {
    missingPrices.push(`Index token (${market.indexToken})`);
  }
  if (!longTicker) {
    missingPrices.push(`Long token (${market.longToken})`);
  }
  if (!shortTicker) {
    missingPrices.push(`Short token (${market.shortToken})`);
  }
  if (missingPrices.length > 0) {
    console.error("Missing prices for:");
    missingPrices.forEach((token) => console.error(`  - ${token}`));
    throw new Error("Missing required token prices from API");
  }

  return {
    indexTokenPrice: indexTicker,
    longTokenPrice: longTicker,
    shortTokenPrice: shortTicker,
  };
}

async function main() {
  // Parse configuration from environment variables
  const collateralAmountUsd = parseFloat(process.env.COLLATERAL_AMOUNT_USD || "2");
  const leverage = parseFloat(process.env.LEVERAGE || "2");
  const collateralTokenSymbol = process.env.COLLATERAL_TOKEN || "USDC";
  const marketsFilter = process.env.MARKETS ? process.env.MARKETS.split(",").map((m) => m.trim()) : [];

  if (!process.env.ACCOUNT_KEY) {
    throw new Error("ACCOUNT_KEY environment variable is required");
  }

  console.log("Configuration:");
  console.log("  Collateral Amount (USD): $%s", collateralAmountUsd);
  console.log("  Leverage: %sx", leverage);
  console.log("  Collateral Token: %s", collateralTokenSymbol);
  console.log("  Markets Filter: %s", marketsFilter.length > 0 ? marketsFilter.join(", ") : "all markets");
  console.log("");

  // Calculate position size
  const positionSizeUsd = collateralAmountUsd * leverage;
  console.log("Position size (USD): $%s", positionSizeUsd);
  console.log("");

  // Connect to contracts
  const router = await hre.ethers.getContract("Router");
  const reader = await hre.ethers.getContract("Reader");
  const dataStore = await hre.ethers.getContract("DataStore");
  const exchangeRouter = await hre.ethers.getContract("ExchangeRouter");
  const orderVault = await hre.ethers.getContract("OrderVault");

  const signer = exchangeRouter.signer;
  const receiver = await signer.getAddress();
  const referralCode = hre.ethers.constants.HashZero;

  // Get all markets
  const allMarkets = await reader.getMarkets(dataStore.address, 0, 100);
  console.log("Found %s total markets", allMarkets.length);

  // Filter markets if specified
  let markets = allMarkets;
  if (marketsFilter.length > 0) {
    markets = allMarkets.filter((m) =>
      marketsFilter.some((filter) => m.marketToken.toLowerCase() === filter.toLowerCase())
    );
    console.log("Filtered to %s markets", markets.length);
    if (markets.length === 0) {
      throw new Error("No markets found matching the filter");
    }
  }

  // Filter out disabled markets
  const enabledMarkets = [];
  for (const market of markets) {
    const isDisabled = await dataStore.getBool(keys.isMarketDisabledKey(market.marketToken));
    if (!isDisabled) {
      enabledMarkets.push(market);
    }
  }
  console.log("Found %s enabled markets", enabledMarkets.length);
  console.log("");

  if (enabledMarkets.length === 0) {
    throw new Error("No enabled markets found");
  }

  // Get tokens and find collateral token
  const tokens = await hre.gmx.getTokens();
  const collateralTokenConfig = tokens[collateralTokenSymbol];
  if (!collateralTokenConfig) {
    throw new Error(`Token ${collateralTokenSymbol} not found in token config`);
  }

  const collateralToken = await contractAt("MintableToken", collateralTokenConfig.address, signer);
  const collateralDecimals = await collateralToken.decimals();
  console.log("Collateral token: %s (%s decimals)", collateralTokenSymbol, collateralDecimals);

  // Calculate collateral amount
  // For simplicity, for stablecoins we assume 1:1 USD ratio
  // For other tokens, the user should specify the token amount they want
  const stablecoins = ["USDC", "USDT", "DAI", "USDC.e"];
  const collateralTokenAmount = expandDecimals(collateralAmountUsd, collateralDecimals);

  if (stablecoins.includes(collateralTokenSymbol)) {
    console.log("Using 1:1 USD conversion for stablecoin");
  } else {
    console.log("Non-stablecoin detected. COLLATERAL_AMOUNT_USD will be interpreted as token amount (not USD value)");
  }

  console.log(
    "Collateral token amount: %s %s",
    hre.ethers.utils.formatUnits(collateralTokenAmount, collateralDecimals),
    collateralTokenSymbol
  );
  console.log("");

  // Check and approve collateral token if needed
  const approvedAmount = await collateralToken.allowance(receiver, router.address);
  const totalCollateralNeeded = collateralTokenAmount.mul(enabledMarkets.length).mul(2); // 2 orders per market
  if (approvedAmount.lt(totalCollateralNeeded)) {
    console.log("Approving collateral token...");
    const approveTx = await collateralToken.approve(router.address, bigNumberify(2).pow(256).sub(1));
    await approveTx.wait();
    console.log("Approval tx: %s", approveTx.hash);
    console.log("");
  }

  // Calculate execution fee
  const estimatedGasLimit = 10_000_000;
  const gasPrice = await signer.getGasPrice();
  const executionFee = gasPrice.mul(estimatedGasLimit);
  console.log("Execution fee per order: %s ETH", hre.ethers.utils.formatEther(executionFee));
  console.log("");

  // Position size in 30 decimal format
  const sizeDeltaUsd = decimalToFloat(positionSizeUsd);

  let successCount = 0;
  let errorCount = 0;

  // Create orders for each market
  for (const market of enabledMarkets) {
    console.log("Market: %s", market.marketToken);

    // Fetch oracle prices for this market
    let marketPrices;
    try {
      marketPrices = await getMarketPrices(market);
    } catch (error) {
      console.log("  Error fetching market prices: %s", error.message);
      console.log("  Skipping market...");
      errorCount += 2; // Count as 2 errors (long + short)
      continue;
    }

    // Calculate acceptable prices with 5% slippage
    // For longs: accept up to 5% higher than max oracle price
    // For shorts: accept down to 5% lower than min oracle price
    // Note: API prices are already in the correct format for the contracts
    const acceptablePriceLong = bigNumberify(marketPrices.indexTokenPrice?.maxPrice || "0")
      .mul(105)
      .div(100);
    const acceptablePriceShort = bigNumberify(marketPrices.indexTokenPrice?.minPrice || "0")
      .mul(95)
      .div(100);

    console.log(
      "  Index token oracle price range: %s - %s (raw values)",
      marketPrices.indexTokenPrice?.minPrice || "0",
      marketPrices.indexTokenPrice?.maxPrice || "0"
    );
    console.log("  Acceptable price (long, +5%%): %s", acceptablePriceLong.toString());
    console.log("  Acceptable price (short, -5%%): %s", acceptablePriceShort.toString());

    // Create LONG order
    try {
      const longOrderParams = {
        addresses: {
          receiver,
          cancellationReceiver: hre.ethers.constants.AddressZero,
          callbackContract: hre.ethers.constants.AddressZero,
          uiFeeReceiver: hre.ethers.constants.AddressZero,
          market: market.marketToken,
          initialCollateralToken: collateralToken.address,
          swapPath: [],
        },
        numbers: {
          sizeDeltaUsd,
          initialCollateralDeltaAmount: collateralTokenAmount,
          triggerPrice: 0,
          acceptablePrice: acceptablePriceLong,
          executionFee,
          callbackGasLimit: 0,
          minOutputAmount: 0,
          validFromTime: 0,
        },
        orderType: OrderType.MarketIncrease,
        decreasePositionSwapType: DecreasePositionSwapType.NoSwap,
        isLong: true,
        shouldUnwrapNativeToken: false,
        autoCancel: false,
        referralCode,
        dataList: [],
      };

      const longTx = await exchangeRouter.multicall(
        [
          exchangeRouter.interface.encodeFunctionData("sendWnt", [orderVault.address, executionFee]),
          exchangeRouter.interface.encodeFunctionData("sendTokens", [
            collateralToken.address,
            orderVault.address,
            collateralTokenAmount,
          ]),
          exchangeRouter.interface.encodeFunctionData("createOrder", [longOrderParams]),
        ],
        { value: executionFee }
      );

      console.log("  Long order tx: %s", longTx.hash);
      await longTx.wait();
      console.log("  Long order confirmed");
      successCount++;
    } catch (error) {
      console.log("  Long order error: %s", error.message);
      errorCount++;
    }

    // Create SHORT order
    try {
      const shortOrderParams = {
        addresses: {
          receiver,
          cancellationReceiver: hre.ethers.constants.AddressZero,
          callbackContract: hre.ethers.constants.AddressZero,
          uiFeeReceiver: hre.ethers.constants.AddressZero,
          market: market.marketToken,
          initialCollateralToken: collateralToken.address,
          swapPath: [],
        },
        numbers: {
          sizeDeltaUsd,
          initialCollateralDeltaAmount: collateralTokenAmount,
          triggerPrice: 0,
          acceptablePrice: acceptablePriceShort,
          executionFee,
          callbackGasLimit: 0,
          minOutputAmount: 0,
          validFromTime: 0,
        },
        orderType: OrderType.MarketIncrease,
        decreasePositionSwapType: DecreasePositionSwapType.NoSwap,
        isLong: false,
        shouldUnwrapNativeToken: false,
        autoCancel: false,
        referralCode,
        dataList: [],
      };

      const shortTx = await exchangeRouter.multicall(
        [
          exchangeRouter.interface.encodeFunctionData("sendWnt", [orderVault.address, executionFee]),
          exchangeRouter.interface.encodeFunctionData("sendTokens", [
            collateralToken.address,
            orderVault.address,
            collateralTokenAmount,
          ]),
          exchangeRouter.interface.encodeFunctionData("createOrder", [shortOrderParams]),
        ],
        { value: executionFee }
      );

      console.log("  Short order tx: %s", shortTx.hash);
      await shortTx.wait();
      console.log("  Short order confirmed");
      successCount++;
    } catch (error) {
      console.log("  Short order error: %s", error.message);
      errorCount++;
    }

    console.log("");
  }

  console.log("Summary:");
  console.log("  Total orders created: %s", successCount);
  console.log("  Total errors: %s", errorCount);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
