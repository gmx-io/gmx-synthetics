import { HardhatRuntimeEnvironment } from "hardhat/types";
import * as keys from "../utils/keys";
import { setBytes32IfDifferent, setUintIfDifferent } from "../utils/dataStore";
import { DEFAULT_MARKET_TYPE, getMarketTokenAddresses } from "../utils/market";
import { getMarketKey, getOnchainMarkets } from "../utils/market";

const func = async ({ deployments, getNamedAccounts, gmx }: HardhatRuntimeEnvironment) => {
  const { execute, get, read, log } = deployments;
  const generalConfig = await gmx.getGeneral();

  if (process.env.SKIP_NEW_MARKETS) {
    log("WARN: new markets will be skipped");
  }

  const { deployer } = await getNamedAccounts();

  const tokens = await gmx.getTokens();
  const markets = await gmx.getMarkets();

  const dataStore = await get("DataStore");

  let onchainMarketsByTokens = await getOnchainMarkets(read, dataStore.address);

  for (const marketConfig of markets) {
    const [indexToken, longToken, shortToken] = getMarketTokenAddresses(marketConfig, tokens);

    const marketKey = getMarketKey(indexToken, longToken, shortToken);
    const onchainMarket = onchainMarketsByTokens[marketKey];
    if (onchainMarket) {
      log("market %s:%s:%s already exists at %s", indexToken, longToken, shortToken, onchainMarket.marketToken);
      continue;
    }

    if (process.env.SKIP_NEW_MARKETS) {
      log("WARN: new market %s:%s:%s skipped", indexToken, longToken, shortToken);
      continue;
    }

    const marketType = DEFAULT_MARKET_TYPE;
    log("creating market %s:%s:%s:%s", indexToken, longToken, shortToken, marketType);
    await execute(
      "MarketFactory",
      { from: deployer, log: true },
      "createMarket",
      indexToken,
      longToken,
      shortToken,
      marketType
    );
  }

  async function setReserveFactor(marketToken: string, isLong: boolean, reserveFactor: number) {
    const key = keys.reserveFactorKey(marketToken, isLong);
    await setUintIfDifferent(
      key,
      reserveFactor,
      `reserve factor ${marketToken.toString()} ${isLong ? "long" : "short"}`
    );
  }

  async function setOpenInterestReserveFactor(marketToken: string, isLong: boolean, reserveFactor: number) {
    const key = keys.openInterestReserveFactorKey(marketToken, isLong);
    await setUintIfDifferent(
      key,
      reserveFactor,
      `reserve factor ${marketToken.toString()} ${isLong ? "long" : "short"}`
    );
  }

  async function setMinCollateralFactor(marketToken: string, minCollateralFactor: number) {
    const key = keys.minCollateralFactorKey(marketToken);
    await setUintIfDifferent(key, minCollateralFactor, `min collateral factor ${marketToken.toString()}`);
  }

  async function setMinCollateralFactorForOpenInterestMultiplier(
    marketToken: string,
    minCollateralFactorForOpenInterestMultiplier: number,
    isLong: boolean
  ) {
    const key = keys.minCollateralFactorForOpenInterestMultiplierKey(marketToken, isLong);
    await setUintIfDifferent(
      key,
      minCollateralFactorForOpenInterestMultiplier,
      `min collateral factor for open interest multiplier ${marketToken.toString()}`
    );
  }

  async function setMaxPoolAmount(marketToken: string, token: string, maxPoolAmount: number) {
    const key = keys.maxPoolAmountKey(marketToken, token);
    await setUintIfDifferent(key, maxPoolAmount, `max pool amount ${marketToken.toString()} ${token.toString()}`);
  }

  async function setMaxOpenInterest(marketToken: string, isLong: boolean, maxOpenInterest: number) {
    const key = keys.maxOpenInterestKey(marketToken, isLong);
    await setUintIfDifferent(
      key,
      maxOpenInterest,
      `max open interest ${marketToken.toString()} ${isLong ? "long" : "short"}`
    );
  }

  async function setMaxPnlFactor(
    pnlFactorType: string,
    marketToken: string,
    isLong: boolean,
    maxPnlFactor: number,
    label: string
  ) {
    const key = keys.maxPnlFactorKey(pnlFactorType, marketToken, isLong);
    await setUintIfDifferent(key, maxPnlFactor, `${label} ${marketToken.toString()} ${isLong ? "long" : "short"}`);
  }

  onchainMarketsByTokens = await getOnchainMarkets(read, dataStore.address);

  for (const marketConfig of markets) {
    const [indexToken, longToken, shortToken] = getMarketTokenAddresses(marketConfig, tokens);
    const marketKey = getMarketKey(indexToken, longToken, shortToken);
    const onchainMarket = onchainMarketsByTokens[marketKey];
    const marketToken = onchainMarket.marketToken;

    // if trades are done before virtual IDs are set, the tracking of virtual
    // inventories may not be accurate
    //
    // so virtual IDs should be set before other market configurations e.g.
    // max pool amounts, this would help to ensure that no trades can be done
    // before virtual IDs are set

    // set virtual market id for swaps
    const virtualMarketId = marketConfig.virtualMarketId;
    if (virtualMarketId) {
      await setBytes32IfDifferent(
        keys.virtualMarketIdKey(marketToken),
        virtualMarketId,
        `virtual market id for market ${marketToken.toString()}`
      );
    }

    // set virtual token id for perps
    const virtualTokenId = marketConfig.virtualTokenIdForIndexToken;
    if (virtualTokenId) {
      await setBytes32IfDifferent(
        keys.virtualTokenIdKey(indexToken),
        virtualTokenId,
        `virtual token id for indexToken ${indexToken.toString()}`
      );
    }

    await setMaxPoolAmount(marketToken, longToken, marketConfig.maxLongTokenPoolAmount);
    await setMaxPoolAmount(marketToken, shortToken, marketConfig.maxShortTokenPoolAmount);

    for (const name of ["swapImpactExponentFactor"]) {
      if (marketConfig[name]) {
        const value = marketConfig[name];
        const key = keys[`${name}Key`](marketToken);
        await setUintIfDifferent(key, value, `${name} for ${marketToken.toString()}`);
      }
    }

    if (marketConfig.swapFeeFactorForPositiveImpact) {
      const key = keys.swapFeeFactorKey(marketToken, true);
      await setUintIfDifferent(
        key,
        marketConfig.swapFeeFactorForPositiveImpact,
        `swapFeeFactorForPositiveImpact for ${marketToken.toString()}`
      );
    }

    if (marketConfig.swapFeeFactorForNegativeImpact) {
      const key = keys.swapFeeFactorKey(marketToken, false);
      await setUintIfDifferent(
        key,
        marketConfig.swapFeeFactorForNegativeImpact,
        `swapFeeFactorForNegativeImpact for ${marketToken.toString()}`
      );
    }

    if (marketConfig.positiveSwapImpactFactor) {
      const key = keys.swapImpactFactorKey(marketToken, true);
      await setUintIfDifferent(
        key,
        marketConfig.positiveSwapImpactFactor,
        `positive swap impact factor for ${marketToken.toString()}`
      );
    }
    if (marketConfig.negativeSwapImpactFactor) {
      const key = keys.swapImpactFactorKey(marketToken, false);
      await setUintIfDifferent(
        key,
        marketConfig.negativeSwapImpactFactor,
        `negative swap impact factor for ${marketToken.toString()}`
      );
    }

    // the rest params are not used for swap-only markets
    if (marketConfig.swapOnly) {
      continue;
    }

    await setMinCollateralFactor(marketToken, marketConfig.minCollateralFactor);

    await setMinCollateralFactorForOpenInterestMultiplier(
      marketToken,
      marketConfig.minCollateralFactorForOpenInterestMultiplierLong,
      true
    );
    await setMinCollateralFactorForOpenInterestMultiplier(
      marketToken,
      marketConfig.minCollateralFactorForOpenInterestMultiplierShort,
      false
    );

    await setMaxOpenInterest(marketToken, true, marketConfig.maxOpenInterestForLongs);
    await setMaxOpenInterest(marketToken, false, marketConfig.maxOpenInterestForShorts);

    await setReserveFactor(marketToken, true, marketConfig.reserveFactorLongs);
    await setReserveFactor(marketToken, false, marketConfig.reserveFactorShorts);

    await setOpenInterestReserveFactor(marketToken, true, marketConfig.openInterestReserveFactorLongs);
    await setOpenInterestReserveFactor(marketToken, false, marketConfig.openInterestReserveFactorShorts);

    await setMaxPnlFactor(
      keys.MAX_PNL_FACTOR_FOR_TRADERS,
      marketToken,
      true,
      marketConfig.maxPnlFactorForTradersLongs,
      "max pnl factor for traders"
    );
    await setMaxPnlFactor(
      keys.MAX_PNL_FACTOR_FOR_TRADERS,
      marketToken,
      false,
      marketConfig.maxPnlFactorForTradersShorts,
      "max pnl factor for traders"
    );

    await setMaxPnlFactor(
      keys.MAX_PNL_FACTOR_FOR_ADL,
      marketToken,
      true,
      marketConfig.maxPnlFactorForAdlLongs,
      "max pnl factor for adl"
    );
    await setMaxPnlFactor(
      keys.MAX_PNL_FACTOR_FOR_ADL,
      marketToken,
      false,
      marketConfig.maxPnlFactorForAdlShorts,
      "max pnl factor for adl"
    );

    await setUintIfDifferent(
      keys.minPnlFactorAfterAdl(marketToken, true),
      marketConfig.minPnlFactorAfterAdlLongs,
      `min pnl factor after adl ${marketToken.toString()} long`
    );
    await setUintIfDifferent(
      keys.minPnlFactorAfterAdl(marketToken, false),
      marketConfig.minPnlFactorAfterAdlShorts,
      `min pnl factor after adl ${marketToken.toString()} short`
    );

    await setMaxPnlFactor(
      keys.MAX_PNL_FACTOR_FOR_DEPOSITS,
      marketToken,
      true,
      marketConfig.maxPnlFactorForDepositsLongs,
      "max pnl factor for deposits"
    );
    await setMaxPnlFactor(
      keys.MAX_PNL_FACTOR_FOR_DEPOSITS,
      marketToken,
      false,
      marketConfig.maxPnlFactorForDepositsShorts,
      "max pnl factor for deposits"
    );

    await setMaxPnlFactor(
      keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS,
      marketToken,
      true,
      marketConfig.maxPnlFactorForWithdrawalsLongs,
      "max pnl factor for withdrawals"
    );
    await setMaxPnlFactor(
      keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS,
      marketToken,
      false,
      marketConfig.maxPnlFactorForWithdrawalsShorts,
      "max pnl factor for withdrawals"
    );

    await setUintIfDifferent(
      keys.tokenTransferGasLimit(marketToken),
      generalConfig.tokenTransferGasLimit,
      `market token transfer gas limit`
    );

    for (const name of ["positionImpactExponentFactor", "fundingFactor"]) {
      if (marketConfig[name]) {
        const value = marketConfig[name];
        const key = keys[`${name}Key`](marketToken);
        await setUintIfDifferent(key, value, `${name} for ${marketToken.toString()}`);
      }
    }

    if (marketConfig.positionFeeFactorForPositiveImpact) {
      const key = keys.positionFeeFactorKey(marketToken, true);
      await setUintIfDifferent(
        key,
        marketConfig.positionFeeFactorForPositiveImpact,
        `positionFeeFactorForPositiveImpact ${marketToken.toString()}`
      );
    }

    if (marketConfig.positionFeeFactorForNegativeImpact) {
      const key = keys.positionFeeFactorKey(marketToken, false);
      await setUintIfDifferent(
        key,
        marketConfig.positionFeeFactorForNegativeImpact,
        `positionFeeFactorForPositiveImpact ${marketToken.toString()}`
      );
    }

    if (marketConfig.borrowingFactorForLongs) {
      const key = keys.borrowingFactorKey(marketToken, true);
      await setUintIfDifferent(
        key,
        marketConfig.borrowingFactorForLongs,
        `borrowing factor for longs for ${marketToken.toString()}`
      );
    }

    if (marketConfig.fundingExponentFactor) {
      const key = keys.fundingExponentFactorKey(marketToken);
      await setUintIfDifferent(
        key,
        marketConfig.fundingExponentFactor,
        `funding exponent factor for ${marketToken.toString()}`
      );
    }

    if (marketConfig.borrowingFactorForShorts) {
      const key = keys.borrowingFactorKey(marketToken, false);
      await setUintIfDifferent(
        key,
        marketConfig.borrowingFactorForShorts,
        `borrowing factor for shorts for ${marketToken.toString()}`
      );
    }

    if (marketConfig.borrowingExponentFactorForLongs) {
      const key = keys.borrowingExponentFactorKey(marketToken, true);
      await setUintIfDifferent(
        key,
        marketConfig.borrowingExponentFactorForLongs,
        `borrowing exponent factor for longs for ${marketToken.toString()}`
      );
    }

    if (marketConfig.borrowingExponentFactorForShorts) {
      const key = keys.borrowingExponentFactorKey(marketToken, false);
      await setUintIfDifferent(
        key,
        marketConfig.borrowingExponentFactorForShorts,
        `borrowing exponent factor for shorts for ${marketToken.toString()}`
      );
    }

    if (marketConfig.positivePositionImpactFactor) {
      const key = keys.positionImpactFactorKey(marketToken, true);
      await setUintIfDifferent(
        key,
        marketConfig.positivePositionImpactFactor,
        `positive position impact factor for ${marketToken.toString()}`
      );
    }
    if (marketConfig.negativePositionImpactFactor) {
      const key = keys.positionImpactFactorKey(marketToken, false);
      await setUintIfDifferent(
        key,
        marketConfig.negativePositionImpactFactor,
        `negative position impact factor for ${marketToken.toString()}`
      );
    }

    if (marketConfig.maxPositionImpactFactorForLiquidations) {
      const key = keys.maxPositionImpactFactorForLiquidationsKey(marketToken);
      await setUintIfDifferent(
        key,
        marketConfig.maxPositionImpactFactorForLiquidations,
        `max position impact factor for liquidations for ${marketToken.toString()}`
      );
    }

    if (marketConfig.positiveMaxPositionImpactFactor) {
      const key = keys.maxPositionImpactFactorKey(marketToken, true);
      await setUintIfDifferent(
        key,
        marketConfig.positiveMaxPositionImpactFactor,
        `positive max position impact factor for ${marketToken.toString()}`
      );
    }
    if (marketConfig.negativeMaxPositionImpactFactor) {
      const key = keys.maxPositionImpactFactorKey(marketToken, false);
      await setUintIfDifferent(
        key,
        marketConfig.negativeMaxPositionImpactFactor,
        `negative max position impact factor for ${marketToken.toString()}`
      );
    }
  }
};

func.skip = async ({ gmx, network }) => {
  // skip if no markets configured
  const markets = await gmx.getMarkets();
  if (!markets || markets.length === 0) {
    console.warn("no markets configured for network %s", network.name);
    return true;
  }
  return false;
};
func.runAtTheEnd = true;
func.tags = ["Markets"];
func.dependencies = ["MarketFactory", "Tokens", "DataStore"];
export default func;
