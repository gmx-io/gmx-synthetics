import hre from "hardhat";
import got from "got";
import { expandDecimals, decimalToFloat, bigNumberify } from "../utils/math";
import { OrderType, DecreasePositionSwapType } from "../utils/order";
import { contractAt } from "../utils/deploy";
import * as keys from "../utils/keys";
import { ethers } from "ethers";

// Creates long and short orders for all (or specified) markets using USDC as collateral.
// Supports both Arbitrum and Avalanche networks.
//
// Collateral Token:
// - Only USDC is supported as the initial collateral token
// - The script automatically generates a swap path when needed to convert USDC to a valid market collateral token
//
// Swap Path:
// - Each market accepts only its longToken or shortToken as collateral
// - If USDC is already a market's longToken or shortToken, no swap is needed (swapPath = [])
// - If USDC is NOT a market collateral token, the script finds a swap market to convert:
//   * USDC → market.shortToken (preferred), or
//   * USDC → market.longToken (fallback)
// - Example: For WETH/WETH market, the script finds WETH/USDC market and uses it to swap USDC → WETH
// - Markets with no available swap path are automatically skipped
//
// Usage:
// - COLLATERAL_AMOUNT: USDC amount (default: 2)
// - LEVERAGE: Leverage multiplier (default: 2)
// - MARKETS: Comma-separated market addresses (if empty, creates orders for all markets)
// - ACCOUNT_KEY: Private key for signing (required)
//
// Example for all markets with defaults ($2 USDC, 2x leverage):
// npx hardhat run --network arbitrum scripts/createMarketsOrders.ts
// npx hardhat run --network avalanche scripts/createMarketsOrders.ts
//
// Example for specific market with custom values:
// COLLATERAL_AMOUNT=5 LEVERAGE=3 MARKETS=0x70d95587d40A2caf56bd97485aB3Eec10Bee6336 npx hardhat run --network arbitrum scripts/createMarketsOrders.ts
// COLLATERAL_AMOUNT=5 LEVERAGE=3 MARKETS=0xB7e69749E3d2EDd90ea59A4932EFEa2D41E245d7 npx hardhat run --network avalanche scripts/createMarketsOrders.ts

function getTickersUrl(): string {
  if (hre.network.name === "arbitrum") {
    return "https://arbitrum-api.gmxinfra2.io/prices/tickers";
  } else if (hre.network.name === "avalanche") {
    return "https://avalanche-api.gmxinfra2.io/prices/tickers";
  } else {
    throw new Error(`Unsupported network: ${hre.network.name}`);
  }
}

async function getMarketPrices(market: any): Promise<any> {
  const tickersUrl = getTickersUrl();
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

function findSwapPath(
  market: any,
  allMarkets: any[],
  usdcAddress: string
): { swapPath: string[]; targetCollateralToken: string } | null {
  const usdcLower = usdcAddress.toLowerCase();

  // Check if USDC is already a collateral token in this market
  if (market.longToken.toLowerCase() === usdcLower) {
    return { swapPath: [], targetCollateralToken: market.longToken };
  }
  if (market.shortToken.toLowerCase() === usdcLower) {
    return { swapPath: [], targetCollateralToken: market.shortToken };
  }

  // USDC is not a collateral token, need to find a swap path
  console.log("Try to find a market that can swap USDC to shortToken (preferred) or longToken");
  for (const swapMarket of allMarkets) {
    const hasUsdc =
      swapMarket.longToken.toLowerCase() === usdcLower || swapMarket.shortToken.toLowerCase() === usdcLower;
    if (!hasUsdc) {
      continue;
    }

    // First, try to find a market to swap USDC -> market.shortToken
    const hasShortToken =
      swapMarket.longToken.toLowerCase() === market.shortToken.toLowerCase() ||
      swapMarket.shortToken.toLowerCase() === market.shortToken.toLowerCase();
    if (hasShortToken) {
      return { swapPath: [swapMarket.marketToken], targetCollateralToken: market.shortToken };
    }

    // Second, try to find a market to swap USDC -> market.longToken
    const hasLongToken =
      swapMarket.longToken.toLowerCase() === market.longToken.toLowerCase() ||
      swapMarket.shortToken.toLowerCase() === market.longToken.toLowerCase();
    if (hasLongToken) {
      return { swapPath: [swapMarket.marketToken], targetCollateralToken: market.longToken };
    }
  }

  // No swap path found
  return null;
}

interface GasConfig {
  baseGasLimit: any;
  gasPerOraclePrice: any;
  gasFeeMultiplier: any;
}

// Calculate execution fee based on DataStore configuration
// This matches the logic in GasUtils.sol adjustGasLimitForEstimate()
function calculateExecutionFee(
  estimatedGasLimit: any,
  oraclePriceCount: number,
  currentGasPrice: any,
  gasConfig: GasConfig
) {
  // adjustedGasLimit = baseGasLimit + (gasPerOraclePrice * oraclePriceCount) + applyFactor(estimatedGasLimit, multiplier)
  let adjustedGasLimit = gasConfig.baseGasLimit.add(gasConfig.gasPerOraclePrice.mul(oraclePriceCount));

  // Apply multiplier factor if it's set (non-zero)
  if (!gasConfig.gasFeeMultiplier.isZero()) {
    // Precision.applyFactor(value, factor) = value * factor / FLOAT_PRECISION (1e30)
    const multipliedGas = estimatedGasLimit.mul(gasConfig.gasFeeMultiplier).div(expandDecimals(1, 30));
    adjustedGasLimit = adjustedGasLimit.add(multipliedGas);
  } else {
    adjustedGasLimit = adjustedGasLimit.add(estimatedGasLimit);
  }

  // Use a safe gas price for calculation
  // On Avalanche, gas price can be very low when queried but spike to 200+ gwei during execution
  // The contract validates using tx.gasprice, so we need to ensure execution fee covers the spike
  let safeGasPrice = currentGasPrice;
  if (hre.network.name === "avalanche") {
    const minGasPrice = hre.ethers.utils.parseUnits("200", "gwei"); // 200 gwei minimum for Avalanche
    safeGasPrice = currentGasPrice.gt(minGasPrice) ? currentGasPrice : minGasPrice;
  }

  // Calculate execution fee with 20% additional buffer
  const executionFee = safeGasPrice.mul(adjustedGasLimit).mul(120).div(100);

  return executionFee;
}

async function main() {
  // Parse configuration from environment variables
  const collateralAmount = parseFloat(process.env.COLLATERAL_AMOUNT || "2");
  const leverage = parseFloat(process.env.LEVERAGE || "2");
  const marketsFilter = process.env.MARKETS ? process.env.MARKETS.split(",").map((m) => m.trim()) : [];

  if (!process.env.ACCOUNT_KEY) {
    throw new Error("ACCOUNT_KEY environment variable is required");
  }

  console.log("Configuration:");
  console.log("  Collateral Amount: $%s USDC", collateralAmount);
  console.log("  Leverage: %sx", leverage);
  console.log("  Markets Filter: %s", marketsFilter.length > 0 ? marketsFilter.join(", ") : "all markets");
  console.log("");

  // Calculate position size
  const positionSizeUsd = collateralAmount * leverage;
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
  const allMarkets = await reader.getMarkets(dataStore.address, 0, 1000); // currently there are ~115 markets
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

  // Get USDC token
  const tokens = await hre.gmx.getTokens();
  const usdcConfig = tokens.USDC;
  if (!usdcConfig) {
    throw new Error("USDC not found in token config");
  }

  const collateralToken = await contractAt("MintableToken", usdcConfig.address, signer);
  const collateralDecimals = await collateralToken.decimals();
  console.log("Collateral token: USDC (%s decimals)", collateralDecimals);

  // Calculate collateral amount (USDC uses 6 decimals)
  const collateralTokenAmount = expandDecimals(collateralAmount, collateralDecimals);

  console.log(
    "Collateral token amount: %s USDC",
    hre.ethers.utils.formatUnits(collateralTokenAmount, collateralDecimals)
  );
  console.log("");

  // Check USDC balance
  const totalCollateralNeeded = collateralTokenAmount.mul(enabledMarkets.length).mul(2); // 2 orders per market
  const usdcBalance = await collateralToken.balanceOf(receiver);
  if (usdcBalance.lt(totalCollateralNeeded)) {
    throw new Error(
      `Insufficient USDC balance. Need ${hre.ethers.utils.formatUnits(
        totalCollateralNeeded,
        collateralDecimals
      )} USDC but only have ${hre.ethers.utils.formatUnits(usdcBalance, collateralDecimals)} USDC`
    );
  }

  // Check and approve collateral token if needed
  const approvedAmount = await collateralToken.allowance(receiver, router.address);
  if (approvedAmount.lt(totalCollateralNeeded)) {
    console.log("Approving collateral token...");
    const approveTx = await collateralToken.approve(router.address, bigNumberify(2).pow(256).sub(1));
    await approveTx.wait();
    console.log("Approval tx: %s", approveTx.hash);
    console.log("");
  }

  // Query gas configuration from DataStore
  // These values are used by the contract to calculate minimum execution fee
  const gasConfig: GasConfig = {
    baseGasLimit: await dataStore.getUint(keys.ESTIMATED_GAS_FEE_BASE_AMOUNT_V2_1),
    gasPerOraclePrice: await dataStore.getUint(keys.ESTIMATED_GAS_FEE_PER_ORACLE_PRICE),
    gasFeeMultiplier: await dataStore.getUint(keys.ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR),
  };

  // Query order execution gas limits
  const increaseOrderGasLimit = await dataStore.getUint(keys.increaseOrderGasLimitKey());
  const singleSwapGasLimit = await dataStore.getUint(keys.singleSwapGasLimitKey());

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

    // Determine swap path from USDC to market collateral token
    const swapPathResult = findSwapPath(market, allMarkets, usdcConfig.address);
    if (!swapPathResult) {
      console.log("  ⚠️  No swap path found from USDC to market collateral tokens. Skipping market...\n");
      errorCount += 2; // Count as 2 errors (long + short)
      continue;
    }

    const { swapPath, targetCollateralToken } = swapPathResult;
    if (swapPath.length === 0) {
      console.log("  USDC is already a collateral token for this market (no swap needed)");
    } else {
      console.log("  Swap path: USDC -> %s (via market %s)", targetCollateralToken, swapPath[0]);
    }

    // Calculate order estimated gas limit (matches GasUtils.estimateExecuteIncreaseOrderGasLimit)
    const orderEstimatedGasLimit = increaseOrderGasLimit.add(singleSwapGasLimit.mul(swapPath.length));
    // Calculate oracle price count: 3 base prices + 1 per swap
    // See GasUtils.sol estimateOrderOraclePriceCount()
    const oraclePriceCount = 3 + swapPath.length;

    // Calculate execution fee using proper gas limits
    const currentGasPrice = await signer.getGasPrice();
    const executionFee = calculateExecutionFee(orderEstimatedGasLimit, oraclePriceCount, currentGasPrice, gasConfig);

    console.log(
      "  Execution fee per order: %s %s",
      hre.ethers.utils.formatEther(executionFee),
      hre.network.name === "avalanche" ? "AVAX" : "ETH"
    );

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
          swapPath: swapPath,
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

      const longMulticallData = [
        exchangeRouter.interface.encodeFunctionData("sendWnt", [orderVault.address, executionFee]),
        exchangeRouter.interface.encodeFunctionData("sendTokens", [
          collateralToken.address,
          orderVault.address,
          collateralTokenAmount,
        ]),
        exchangeRouter.interface.encodeFunctionData("createOrder", [longOrderParams]),
      ];

      const longTx = await exchangeRouter.multicall(longMulticallData, { value: executionFee });

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
          swapPath: swapPath,
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

      const shortMulticallData = [
        exchangeRouter.interface.encodeFunctionData("sendWnt", [orderVault.address, executionFee]),
        exchangeRouter.interface.encodeFunctionData("sendTokens", [
          collateralToken.address,
          orderVault.address,
          collateralTokenAmount,
        ]),
        exchangeRouter.interface.encodeFunctionData("createOrder", [shortOrderParams]),
      ];

      const shortTx = await exchangeRouter.multicall(shortMulticallData, { value: executionFee });

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
