import { HardhatRuntimeEnvironment } from "hardhat/types";
import * as keys from "../utils/keys";
import { setBoolIfDifferent, setBytes32IfDifferent, setUintIfDifferent } from "../utils/dataStore";
import { DEFAULT_MARKET_TYPE, getMarketTokenAddresses, getMarketKey, getOnchainMarkets } from "../utils/market";

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
      `min collateral factor for open interest multiplier ${marketToken.toString()} ${isLong ? "long" : "short"}`
    );
  }

  async function setMaxPoolAmount(marketToken: string, token: string, maxPoolAmount: number) {
    const key = keys.maxPoolAmountKey(marketToken, token);
    await setUintIfDifferent(key, maxPoolAmount, `max pool amount ${marketToken.toString()} ${token.toString()}`);
  }

  async function setMaxPoolAmountForDeposit(marketToken: string, token: string, maxPoolAmount: number) {
    const key = keys.maxPoolAmountForDepositKey(marketToken, token);
    await setUintIfDifferent(
      key,
      maxPoolAmount,
      `max pool amount for deposit ${marketToken.toString()} ${token.toString()}`
    );
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
    const requests: Promise<any>[] = [];

    // if trades are done before virtual IDs are set, the tracking of virtual
    // inventories may not be accurate
    //
    // so virtual IDs should be set before other market configurations e.g.
    // max pool amounts, this would help to ensure that no trades can be done
    // before virtual IDs are set

    // set virtual market id for swaps
    const virtualMarketId = marketConfig.virtualMarketId;
    if (virtualMarketId) {
      requests.push(
        setBytes32IfDifferent(
          keys.virtualMarketIdKey(marketToken),
          virtualMarketId,
          `virtual market id for market ${marketToken.toString()}`
        )
      );
    }

    // set virtual token id for perps
    const virtualTokenId = marketConfig.virtualTokenIdForIndexToken;
    if (virtualTokenId) {
      requests.push(
        setBytes32IfDifferent(
          keys.virtualTokenIdKey(indexToken),
          virtualTokenId,
          `virtual token id for indexToken ${indexToken.toString()}`
        )
      );
    }

    requests.push(setMaxPoolAmount(marketToken, longToken, marketConfig.maxLongTokenPoolAmount));
    requests.push(setMaxPoolAmount(marketToken, shortToken, marketConfig.maxShortTokenPoolAmount));

    requests.push(setMaxPoolAmountForDeposit(marketToken, longToken, marketConfig.maxLongTokenPoolAmountForDeposit));
    requests.push(setMaxPoolAmountForDeposit(marketToken, shortToken, marketConfig.maxShortTokenPoolAmountForDeposit));

    for (const name of ["swapImpactExponentFactor"]) {
      if (marketConfig[name]) {
        const value = marketConfig[name];
        const key = keys[`${name}Key`](marketToken);
        requests.push(setUintIfDifferent(key, value, `${name} for ${marketToken.toString()}`));
      }
    }

    if (marketConfig.isDisabled !== undefined) {
      const key = keys.isMarketDisabledKey(marketToken);
      requests.push(setBoolIfDifferent(key, marketConfig.isDisabled, `isDisabled for ${marketToken}`));
    }

    if (marketConfig.swapFeeFactorForPositiveImpact) {
      const key = keys.swapFeeFactorKey(marketToken, true);
      requests.push(
        setUintIfDifferent(
          key,
          marketConfig.swapFeeFactorForPositiveImpact,
          `swapFeeFactorForPositiveImpact for ${marketToken.toString()}`
        )
      );
    }

    if (marketConfig.swapFeeFactorForNegativeImpact) {
      const key = keys.swapFeeFactorKey(marketToken, false);
      requests.push(
        setUintIfDifferent(
          key,
          marketConfig.swapFeeFactorForNegativeImpact,
          `swapFeeFactorForNegativeImpact for ${marketToken.toString()}`
        )
      );
    }

    if (marketConfig.positiveSwapImpactFactor) {
      const key = keys.swapImpactFactorKey(marketToken, true);
      requests.push(
        setUintIfDifferent(
          key,
          marketConfig.positiveSwapImpactFactor,
          `positive swap impact factor for ${marketToken.toString()}`
        )
      );
    }
    if (marketConfig.negativeSwapImpactFactor) {
      const key = keys.swapImpactFactorKey(marketToken, false);
      requests.push(
        setUintIfDifferent(
          key,
          marketConfig.negativeSwapImpactFactor,
          `negative swap impact factor for ${marketToken.toString()}`
        )
      );
    }

    // the rest of the params are not used for swap-only markets
    if (marketConfig.swapOnly) {
      await Promise.all(requests);
      continue;
    }

    requests.push(setMinCollateralFactor(marketToken, marketConfig.minCollateralFactor));

    requests.push(
      setMinCollateralFactorForOpenInterestMultiplier(
        marketToken,
        marketConfig.minCollateralFactorForOpenInterestMultiplierLong,
        true
      )
    );
    requests.push(
      setMinCollateralFactorForOpenInterestMultiplier(
        marketToken,
        marketConfig.minCollateralFactorForOpenInterestMultiplierShort,
        false
      )
    );

    requests.push(setMaxOpenInterest(marketToken, true, marketConfig.maxOpenInterestForLongs));
    requests.push(setMaxOpenInterest(marketToken, false, marketConfig.maxOpenInterestForShorts));

    requests.push(setReserveFactor(marketToken, true, marketConfig.reserveFactorLongs));
    requests.push(setReserveFactor(marketToken, false, marketConfig.reserveFactorShorts));

    requests.push(setOpenInterestReserveFactor(marketToken, true, marketConfig.openInterestReserveFactorLongs));
    requests.push(setOpenInterestReserveFactor(marketToken, false, marketConfig.openInterestReserveFactorShorts));

    requests.push(
      setMaxPnlFactor(
        keys.MAX_PNL_FACTOR_FOR_TRADERS,
        marketToken,
        true,
        marketConfig.maxPnlFactorForTradersLongs,
        "max pnl factor for traders"
      )
    );
    requests.push(
      setMaxPnlFactor(
        keys.MAX_PNL_FACTOR_FOR_TRADERS,
        marketToken,
        false,
        marketConfig.maxPnlFactorForTradersShorts,
        "max pnl factor for traders"
      )
    );

    requests.push(
      setMaxPnlFactor(
        keys.MAX_PNL_FACTOR_FOR_ADL,
        marketToken,
        true,
        marketConfig.maxPnlFactorForAdlLongs,
        "max pnl factor for adl"
      )
    );
    requests.push(
      setMaxPnlFactor(
        keys.MAX_PNL_FACTOR_FOR_ADL,
        marketToken,
        false,
        marketConfig.maxPnlFactorForAdlShorts,
        "max pnl factor for adl"
      )
    );

    requests.push(
      setUintIfDifferent(
        keys.minPnlFactorAfterAdl(marketToken, true),
        marketConfig.minPnlFactorAfterAdlLongs,
        `min pnl factor after adl ${marketToken.toString()} long`
      )
    );
    requests.push(
      setUintIfDifferent(
        keys.minPnlFactorAfterAdl(marketToken, false),
        marketConfig.minPnlFactorAfterAdlShorts,
        `min pnl factor after adl ${marketToken.toString()} short`
      )
    );

    requests.push(
      setMaxPnlFactor(
        keys.MAX_PNL_FACTOR_FOR_DEPOSITS,
        marketToken,
        true,
        marketConfig.maxPnlFactorForDepositsLongs,
        "max pnl factor for deposits"
      )
    );
    requests.push(
      setMaxPnlFactor(
        keys.MAX_PNL_FACTOR_FOR_DEPOSITS,
        marketToken,
        false,
        marketConfig.maxPnlFactorForDepositsShorts,
        "max pnl factor for deposits"
      )
    );

    requests.push(
      setMaxPnlFactor(
        keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS,
        marketToken,
        true,
        marketConfig.maxPnlFactorForWithdrawalsLongs,
        "max pnl factor for withdrawals"
      )
    );
    requests.push(
      setMaxPnlFactor(
        keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS,
        marketToken,
        false,
        marketConfig.maxPnlFactorForWithdrawalsShorts,
        "max pnl factor for withdrawals"
      )
    );

    requests.push(
      setUintIfDifferent(
        keys.tokenTransferGasLimit(marketToken),
        generalConfig.tokenTransferGasLimit,
        `market token transfer gas limit`
      )
    );

    for (const name of [
      "positionImpactExponentFactor",
      "fundingFactor",
      "fundingIncreaseFactorPerSecond",
      "fundingDecreaseFactorPerSecond",
      "minFundingFactorPerSecond",
      "maxFundingFactorPerSecond",
      "thresholdForStableFunding",
      "thresholdForDecreaseFunding",
      "positionImpactPoolDistributionRate",
      "minPositionImpactPoolAmount",
    ]) {
      if (marketConfig[name]) {
        const value = marketConfig[name];
        const key = keys[`${name}Key`](marketToken);
        requests.push(setUintIfDifferent(key, value, `${name} for ${marketToken.toString()}`));
      }
    }

    if (marketConfig.fundingExponentFactor) {
      const key = keys.fundingExponentFactorKey(marketToken);
      requests.push(
        setUintIfDifferent(
          key,
          marketConfig.fundingExponentFactor,
          `funding exponent factor for ${marketToken.toString()}`
        )
      );
    }

    if (marketConfig.positionFeeFactorForPositiveImpact) {
      const key = keys.positionFeeFactorKey(marketToken, true);
      requests.push(
        setUintIfDifferent(
          key,
          marketConfig.positionFeeFactorForPositiveImpact,
          `positionFeeFactorForPositiveImpact ${marketToken.toString()}`
        )
      );
    }

    if (marketConfig.positionFeeFactorForNegativeImpact) {
      const key = keys.positionFeeFactorKey(marketToken, false);
      requests.push(
        setUintIfDifferent(
          key,
          marketConfig.positionFeeFactorForNegativeImpact,
          `positionFeeFactorForPositiveImpact ${marketToken.toString()}`
        )
      );
    }

    if (marketConfig.borrowingFactorForLongs) {
      const key = keys.borrowingFactorKey(marketToken, true);
      requests.push(
        setUintIfDifferent(
          key,
          marketConfig.borrowingFactorForLongs,
          `borrowing factor for longs for ${marketToken.toString()}`
        )
      );
    }

    if (marketConfig.borrowingFactorForShorts) {
      const key = keys.borrowingFactorKey(marketToken, false);
      requests.push(
        setUintIfDifferent(
          key,
          marketConfig.borrowingFactorForShorts,
          `borrowing factor for shorts for ${marketToken.toString()}`
        )
      );
    }

    if (marketConfig.borrowingExponentFactorForLongs) {
      const key = keys.borrowingExponentFactorKey(marketToken, true);
      requests.push(
        setUintIfDifferent(
          key,
          marketConfig.borrowingExponentFactorForLongs,
          `borrowing exponent factor for longs for ${marketToken.toString()}`
        )
      );
    }

    if (marketConfig.borrowingExponentFactorForShorts) {
      const key = keys.borrowingExponentFactorKey(marketToken, false);
      requests.push(
        setUintIfDifferent(
          key,
          marketConfig.borrowingExponentFactorForShorts,
          `borrowing exponent factor for shorts for ${marketToken.toString()}`
        )
      );
    }

    if (marketConfig.positivePositionImpactFactor) {
      const key = keys.positionImpactFactorKey(marketToken, true);
      requests.push(
        setUintIfDifferent(
          key,
          marketConfig.positivePositionImpactFactor,
          `positive position impact factor for ${marketToken.toString()}`
        )
      );
    }
    if (marketConfig.negativePositionImpactFactor) {
      const key = keys.positionImpactFactorKey(marketToken, false);
      requests.push(
        setUintIfDifferent(
          key,
          marketConfig.negativePositionImpactFactor,
          `negative position impact factor for ${marketToken.toString()}`
        )
      );
    }

    if (marketConfig.maxPositionImpactFactorForLiquidations) {
      const key = keys.maxPositionImpactFactorForLiquidationsKey(marketToken);
      requests.push(
        setUintIfDifferent(
          key,
          marketConfig.maxPositionImpactFactorForLiquidations,
          `max position impact factor for liquidations for ${marketToken.toString()}`
        )
      );
    }

    if (marketConfig.positiveMaxPositionImpactFactor) {
      const key = keys.maxPositionImpactFactorKey(marketToken, true);
      requests.push(
        setUintIfDifferent(
          key,
          marketConfig.positiveMaxPositionImpactFactor,
          `positive max position impact factor for ${marketToken.toString()}`
        )
      );
    }
    if (marketConfig.negativeMaxPositionImpactFactor) {
      const key = keys.maxPositionImpactFactorKey(marketToken, false);
      requests.push(
        setUintIfDifferent(
          key,
          marketConfig.negativeMaxPositionImpactFactor,
          `negative max position impact factor for ${marketToken.toString()}`
        )
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
