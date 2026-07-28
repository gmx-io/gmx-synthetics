import { expect } from "chai";
import { deployFixture } from "../../utils/fixture";

import { EXCLUDED_CONFIG_KEYS } from "../../utils/config";
import { grantRole } from "../../utils/role";
import { encodeData, hashString } from "../../utils/hash";
import { bigNumberify, decimalToFloat, expandDecimals, percentageToFloat } from "../../utils/math";
import { TOKEN_ORACLE_TYPES } from "../../utils/oracle";
import { errorsContract } from "../../utils/error";
import { executeWithOracleParams } from "../../utils/exchange";
import * as keys from "../../utils/keys";
import Keys from "../../artifacts/contracts/data/Keys.sol/Keys.json";
import { ethers } from "hardhat";
import { mine } from "@nomicfoundation/hardhat-network-helpers";

describe("Config", () => {
  let fixture;
  let user0, user1, user2, user3;
  let config, riskOracleConfig, oracle, configUtils, dataStore, roleStore, ethUsdMarket, wnt, usdc;
  const { AddressZero } = ethers.constants;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ config, oracle, riskOracleConfig, configUtils, dataStore, roleStore, ethUsdMarket, wnt, usdc } =
      fixture.contracts);
    ({ user0, user1, user2, user3 } = fixture.accounts);

    await grantRole(roleStore, user0.address, "CONFIG_KEEPER");
    await grantRole(roleStore, user2.address, "LIMITED_CONFIG_KEEPER");
    await grantRole(roleStore, user3.address, "RISK_ORACLE");
  });

  it("allows required keys", async () => {
    const keys = Keys.abi.map((i) => i.name);
    console.info(`checking ${keys.length} keys`);

    const excludedKeys = [];

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const hash = hashString(key);

      const isAllowed = (await config.allowedBaseKeys(hash)) === true;
      if (!isAllowed) {
        excludedKeys.push({ key, hash });
      }
    }

    const missingKeys = [];

    for (let i = 0; i < excludedKeys.length; i++) {
      const excludedKey = excludedKeys[i];
      if (!EXCLUDED_CONFIG_KEYS[excludedKey.key]) {
        missingKeys.push(excludedKey);
      }
    }

    if (missingKeys.length > 0) {
      throw new Error(`missing config keys: ${missingKeys.map((i) => i.key).join(", ")}`);
    }
  });

  it("reverts for non-whitelisted keys", async () => {
    await expect(
      config
        .connect(user0)
        .setUint(
          keys.POOL_AMOUNT,
          encodeData(["address", "address"], [ethUsdMarket.marketToken, wnt.address]),
          expandDecimals(100_000, 18)
        )
    )
      .to.be.revertedWithCustomError(errorsContract, "InvalidBaseKey")
      .withArgs(keys.POOL_AMOUNT);
  });

  it("allows LIMITED_CONFIG_KEEPER to set allowedLimitedBaseKeys", async () => {
    await expect(config.connect(user2).setAddress(keys.HOLDING_ADDRESS, "0x", user2.address))
      .to.be.revertedWithCustomError(errorsContract, "InvalidBaseKey")
      .withArgs(keys.HOLDING_ADDRESS);

    expect(await dataStore.getUint(keys.ESTIMATED_GAS_FEE_BASE_AMOUNT_V2_1), "0");
    await config.connect(user2).setUint(keys.ESTIMATED_GAS_FEE_BASE_AMOUNT_V2_1, "0x", "200");
    expect(await dataStore.getUint(keys.ESTIMATED_GAS_FEE_BASE_AMOUNT_V2_1), "200");
  });

  it("allows RISK_ORACLE to set allowed keys only for enabled markets", async () => {
    const market = ethUsdMarket.marketToken;

    await expect(
      riskOracleConfig
        .connect(user3)
        .setUint(keys.MAX_OPEN_INTEREST, encodeData(["address", "bool"], [market, true]), 1)
    ).to.be.revertedWithCustomError(errorsContract, "Unauthorized");

    await riskOracleConfig.connect(user0).setRiskOracleMarketEnabled(market, true);

    await riskOracleConfig
      .connect(user3)
      .setUint(keys.MAX_OPEN_INTEREST, encodeData(["address", "bool"], [market, true]), 1);

    expect(await dataStore.getUint(keys.maxOpenInterestKey(market, true))).eq(1);
  });

  it("settles funding before RISK_ORACLE updates funding config", async () => {
    const market = ethUsdMarket.marketToken;
    const data = encodeData(["address"], [market]);
    const oldFundingFactor = decimalToFloat(1, 9);
    const newFundingFactor = decimalToFloat(2, 9);
    const latestBlock = await ethers.provider.getBlock("latest");

    await riskOracleConfig.connect(user0).setRiskOracleMarketEnabled(market, true);

    await dataStore.setUint(keys.openInterestKey(market, wnt.address, true), expandDecimals(1_000_000, 30));
    await dataStore.setUint(keys.openInterestKey(market, usdc.address, false), expandDecimals(500_000, 30));
    await dataStore.setUint(keys.fundingFactorKey(market), oldFundingFactor);
    await dataStore.setUint(keys.maxFundingFactorPerSecondKey(market, true), oldFundingFactor);
    await dataStore.setUint(keys.maxFundingFactorPerSecondKey(market, false), oldFundingFactor);
    await dataStore.setUint(keys.fundingUpdatedAtKey(market), latestBlock.timestamp - 100);

    expect(await dataStore.getUint(keys.fundingFeeAmountPerSizeKey(market, wnt.address, true))).eq(0);

    await executeWithOracleParams(fixture, {
      args: [keys.FUNDING_FACTOR, data, newFundingFactor],
      oracleBlockNumber: latestBlock.number,
      tokens: [wnt.address, usdc.address],
      precisions: [8, 18],
      minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      dataStreamTokens: [],
      dataStreamData: [],
      priceFeedTokens: [],
      execute: riskOracleConfig.connect(user3).setUintWithOraclePrices,
    });

    expect(await dataStore.getUint(keys.fundingFactorKey(market))).eq(newFundingFactor);
    expect(await dataStore.getUint(keys.fundingFeeAmountPerSizeKey(market, wnt.address, true))).gt(0);
  });

  it("settles borrowing before RISK_ORACLE updates borrowing config", async () => {
    const market = ethUsdMarket.marketToken;
    const isLong = true;
    const data = encodeData(["address", "bool"], [market, isLong]);
    const oldBaseBorrowingFactor = decimalToFloat(1, 9);
    const newBaseBorrowingFactor = decimalToFloat(2, 9);
    const latestBlock = await ethers.provider.getBlock("latest");

    await riskOracleConfig.connect(user0).setRiskOracleMarketEnabled(market, true);

    await dataStore.setUint(keys.poolAmountKey(market, wnt.address), expandDecimals(1_000, 18));
    await dataStore.setUint(keys.poolAmountKey(market, usdc.address), expandDecimals(5_000_000, 6));
    await dataStore.setUint(keys.openInterestInTokensKey(market, wnt.address, isLong), expandDecimals(100, 18));
    await dataStore.setUint(keys.openInterestKey(market, wnt.address, isLong), expandDecimals(500_000, 30));
    await dataStore.setUint(keys.optimalUsageFactorKey(market, isLong), decimalToFloat(8, 1));
    await dataStore.setUint(keys.baseBorrowingFactorKey(market, isLong), oldBaseBorrowingFactor);
    await dataStore.setUint(keys.aboveOptimalUsageBorrowingFactorKey(market, isLong), oldBaseBorrowingFactor);
    await dataStore.setUint(keys.cumulativeBorrowingFactorUpdatedAtKey(market, isLong), latestBlock.timestamp - 100);

    expect(await dataStore.getUint(keys.cumulativeBorrowingFactorKey(market, isLong))).eq(0);

    await executeWithOracleParams(fixture, {
      args: [keys.BASE_BORROWING_FACTOR, data, newBaseBorrowingFactor],
      oracleBlockNumber: latestBlock.number,
      tokens: [wnt.address, usdc.address],
      precisions: [8, 18],
      minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      dataStreamTokens: [],
      dataStreamData: [],
      priceFeedTokens: [],
      execute: riskOracleConfig.connect(user3).setUintWithOraclePrices,
    });

    expect(await dataStore.getUint(keys.baseBorrowingFactorKey(market, isLong))).eq(newBaseBorrowingFactor);
    expect(await dataStore.getUint(keys.cumulativeBorrowingFactorKey(market, isLong))).gt(0);
  });

  it("validates collateral factor invariants for RISK_ORACLE updates", async () => {
    const market = ethUsdMarket.marketToken;
    const data = encodeData(["address"], [market]);
    const minCollateralFactor = decimalToFloat(2, 2); // 2%
    const minCollateralFactorForLiquidation = decimalToFloat(1, 2); // 1%

    await riskOracleConfig.connect(user0).setRiskOracleMarketEnabled(market, true);

    await riskOracleConfig.connect(user3).setUint(keys.MIN_COLLATERAL_FACTOR, data, minCollateralFactor);
    await riskOracleConfig
      .connect(user3)
      .setUint(keys.MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION, data, minCollateralFactorForLiquidation);

    await expect(
      riskOracleConfig
        .connect(user3)
        .setUint(keys.MIN_COLLATERAL_FACTOR, data, minCollateralFactorForLiquidation.sub(1))
    )
      .to.be.revertedWithCustomError(errorsContract, "ConfigValueExceedsAllowedRange")
      .withArgs(keys.MIN_COLLATERAL_FACTOR, minCollateralFactorForLiquidation.sub(1));

    await expect(
      riskOracleConfig
        .connect(user3)
        .setUint(keys.MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION, data, minCollateralFactor.add(1))
    )
      .to.be.revertedWithCustomError(errorsContract, "ConfigValueExceedsAllowedRange")
      .withArgs(keys.MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION, minCollateralFactor.add(1));
  });

  it("allows RISK_ORACLE to set listed two-param and glv keys", async () => {
    const market = ethUsdMarket.marketToken;
    const glv = user1.address;

    await riskOracleConfig.connect(user0).setRiskOracleMarketEnabled(market, true);

    await riskOracleConfig
      .connect(user3)
      .setUint(keys.MAX_OPEN_INTEREST, encodeData(["address", "bool"], [market, true]), decimalToFloat(2_000_000));

    expect(await dataStore.getUint(keys.maxOpenInterestKey(market, true))).eq(decimalToFloat(2_000_000));

    await riskOracleConfig
      .connect(user3)
      .setUint(
        keys.GLV_MAX_MARKET_TOKEN_BALANCE_USD,
        encodeData(["address", "address"], [glv, market]),
        decimalToFloat(500_000)
      );

    expect(await dataStore.getUint(keys.glvMaxMarketTokenBalanceUsdKey(glv, market))).eq(decimalToFloat(500_000));
  });

  it("allows RISK_ORACLE to set POSITION_FEE_FACTOR for both balanceWasImproved values", async () => {
    const market = ethUsdMarket.marketToken;
    const feeFactorImproved = decimalToFloat(1, 4); // 0.01%
    const feeFactorNotImproved = decimalToFloat(5, 4); // 0.05%

    await riskOracleConfig.connect(user0).setRiskOracleMarketEnabled(market, true);

    await riskOracleConfig
      .connect(user3)
      .setUint(keys.POSITION_FEE_FACTOR, encodeData(["address", "bool"], [market, true]), feeFactorImproved);
    await riskOracleConfig
      .connect(user3)
      .setUint(keys.POSITION_FEE_FACTOR, encodeData(["address", "bool"], [market, false]), feeFactorNotImproved);

    expect(await dataStore.getUint(keys.positionFeeFactorKey(market, true))).eq(feeFactorImproved);
    expect(await dataStore.getUint(keys.positionFeeFactorKey(market, false))).eq(feeFactorNotImproved);
  });

  it("settles funding before RISK_ORACLE updates MIN_FUNDING_INCREASE_RATE_PER_SECOND", async () => {
    const market = ethUsdMarket.marketToken;
    const data = encodeData(["address"], [market]);
    const oldFundingFactor = decimalToFloat(1, 9);
    const newMinFundingIncreaseRate = decimalToFloat(1, 10);
    const latestBlock = await ethers.provider.getBlock("latest");

    await riskOracleConfig.connect(user0).setRiskOracleMarketEnabled(market, true);

    await dataStore.setUint(keys.openInterestKey(market, wnt.address, true), expandDecimals(1_000_000, 30));
    await dataStore.setUint(keys.openInterestKey(market, usdc.address, false), expandDecimals(500_000, 30));
    await dataStore.setUint(keys.fundingFactorKey(market), oldFundingFactor);
    await dataStore.setUint(keys.maxFundingFactorPerSecondKey(market, true), oldFundingFactor);
    await dataStore.setUint(keys.maxFundingFactorPerSecondKey(market, false), oldFundingFactor);
    await dataStore.setUint(keys.fundingUpdatedAtKey(market), latestBlock.timestamp - 100);

    expect(await dataStore.getUint(keys.fundingFeeAmountPerSizeKey(market, wnt.address, true))).eq(0);

    await executeWithOracleParams(fixture, {
      args: [keys.MIN_FUNDING_INCREASE_RATE_PER_SECOND, data, newMinFundingIncreaseRate],
      oracleBlockNumber: latestBlock.number,
      tokens: [wnt.address, usdc.address],
      precisions: [8, 18],
      minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      dataStreamTokens: [],
      dataStreamData: [],
      priceFeedTokens: [],
      execute: riskOracleConfig.connect(user3).setUintWithOraclePrices,
    });

    expect(await dataStore.getUint(keys.minFundingIncreaseRatePerSecondKey(market))).eq(newMinFundingIncreaseRate);
    expect(await dataStore.getUint(keys.fundingFeeAmountPerSizeKey(market, wnt.address, true))).gt(0);
  });

  it("allows RISK_ORACLE to set per-side funding factor keys via two-param path", async () => {
    const market = ethUsdMarket.marketToken;
    const minFundingFactor = decimalToFloat(1, 10);
    const maxFundingFactor = decimalToFloat(1, 8);
    const latestBlock = await ethers.provider.getBlock("latest");

    await riskOracleConfig.connect(user0).setRiskOracleMarketEnabled(market, true);

    const setFundingFactor = async (baseKey: string, isLong: boolean, value: any) => {
      await executeWithOracleParams(fixture, {
        args: [baseKey, encodeData(["address", "bool"], [market, isLong]), value],
        oracleBlockNumber: latestBlock.number,
        tokens: [wnt.address, usdc.address],
        precisions: [8, 18],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        dataStreamTokens: [],
        dataStreamData: [],
        priceFeedTokens: [],
        execute: riskOracleConfig.connect(user3).setUintWithOraclePrices,
      });
    };

    await setFundingFactor(keys.MAX_FUNDING_FACTOR_PER_SECOND, true, maxFundingFactor);
    await setFundingFactor(keys.MAX_FUNDING_FACTOR_PER_SECOND, false, maxFundingFactor);
    await setFundingFactor(keys.MIN_FUNDING_FACTOR_PER_SECOND, true, minFundingFactor);
    await setFundingFactor(keys.MIN_FUNDING_FACTOR_PER_SECOND, false, minFundingFactor);

    expect(await dataStore.getUint(keys.maxFundingFactorPerSecondKey(market, true))).eq(maxFundingFactor);
    expect(await dataStore.getUint(keys.maxFundingFactorPerSecondKey(market, false))).eq(maxFundingFactor);
    expect(await dataStore.getUint(keys.minFundingFactorPerSecondKey(market, true))).eq(minFundingFactor);
    expect(await dataStore.getUint(keys.minFundingFactorPerSecondKey(market, false))).eq(minFundingFactor);
  });

  it("prevents RISK_ORACLE from setting non-allowed keys", async () => {
    const market = ethUsdMarket.marketToken;

    await riskOracleConfig.connect(user0).setRiskOracleMarketEnabled(market, true);

    await expect(
      riskOracleConfig
        .connect(user3)
        .setUint(keys.SWAP_FEE_FACTOR, encodeData(["address", "bool"], [market, true]), decimalToFloat(1, 4))
    )
      .to.be.revertedWithCustomError(errorsContract, "InvalidBaseKey")
      .withArgs(keys.SWAP_FEE_FACTOR);
  });

  it("setBool", async () => {
    const key = keys.isMarketDisabledKey(ethUsdMarket.marketToken);

    await expect(
      config.connect(user1).setBool(keys.IS_MARKET_DISABLED, encodeData(["address"], [ethUsdMarket.marketToken]), true)
    ).to.be.revertedWithCustomError(errorsContract, "Unauthorized");

    expect(await dataStore.getBool(key)).eq(false);

    await config
      .connect(user0)
      .setBool(keys.IS_MARKET_DISABLED, encodeData(["address"], [ethUsdMarket.marketToken]), true);

    expect(await dataStore.getBool(key)).eq(true);
  });

  it("setAddress", async () => {
    const key = keys.isMarketDisabledKey(ethUsdMarket.marketToken);

    await expect(
      config
        .connect(user1)
        .setAddress(keys.IS_MARKET_DISABLED, encodeData(["address"], [ethUsdMarket.marketToken]), wnt.address)
    ).to.be.revertedWithCustomError(errorsContract, "Unauthorized");

    expect(await dataStore.getAddress(key)).eq(AddressZero);

    await config
      .connect(user0)
      .setAddress(keys.IS_MARKET_DISABLED, encodeData(["address"], [ethUsdMarket.marketToken]), wnt.address);

    expect(await dataStore.getAddress(key)).eq(wnt.address);
  });

  it("setAddress for EIP6492_DEPLOYER", async () => {
    await expect(
      config.connect(user1).setAddress(keys.EIP6492_DEPLOYER, "0x", user1.address)
    ).to.be.revertedWithCustomError(errorsContract, "Unauthorized");

    await config.connect(user0).setAddress(keys.EIP6492_DEPLOYER, "0x", user1.address);
    expect(await dataStore.getAddress(keys.EIP6492_DEPLOYER)).eq(user1.address);
  });

  it("setBytes32", async () => {
    const key = keys.oracleTypeKey(wnt.address);

    await expect(
      config
        .connect(user1)
        .setBytes32(
          keys.ORACLE_TYPE,
          encodeData(["address"], [wnt.address]),
          "0x0000000000000000000000000000000000000000000000000000000000000123"
        )
    ).to.be.revertedWithCustomError(errorsContract, "Unauthorized");

    expect(await dataStore.getBytes32(key)).eq(TOKEN_ORACLE_TYPES.DEFAULT);

    await config
      .connect(user0)
      .setBytes32(
        keys.ORACLE_TYPE,
        encodeData(["address"], [wnt.address]),
        "0x0000000000000000000000000000000000000000000000000000000000000123"
      );

    expect(await dataStore.getBytes32(key)).eq("0x0000000000000000000000000000000000000000000000000000000000000123");
  });

  it("setUint", async () => {
    const key = keys.swapImpactFactorKey(ethUsdMarket.marketToken, true);

    await expect(
      config
        .connect(user1)
        .setUint(keys.SWAP_IMPACT_FACTOR, encodeData(["address", "bool"], [ethUsdMarket.marketToken, true]), 700)
    ).to.be.revertedWithCustomError(errorsContract, "Unauthorized");

    expect(await dataStore.getUint(key)).eq(0);

    await config
      .connect(user0)
      .setUint(keys.SWAP_IMPACT_FACTOR, encodeData(["address", "bool"], [ethUsdMarket.marketToken, true]), 700);

    expect(await dataStore.getUint(key)).eq(700);
  });

  it("setInt", async () => {
    const key = keys.swapImpactFactorKey(ethUsdMarket.marketToken, true);

    await expect(
      config
        .connect(user1)
        .setInt(keys.SWAP_IMPACT_FACTOR, encodeData(["address", "bool"], [ethUsdMarket.marketToken, true]), -500)
    ).to.be.revertedWithCustomError(errorsContract, "Unauthorized");

    expect(await dataStore.getInt(key)).eq(0);

    await config
      .connect(user0)
      .setInt(keys.SWAP_IMPACT_FACTOR, encodeData(["address", "bool"], [ethUsdMarket.marketToken, true]), -500);

    expect(await dataStore.getInt(key)).eq(-500);
  });

  it("sets values", async () => {
    const getValue = ({ type, initial, index }) => {
      if (type === "Address") {
        return user1.address;
      }
      if (type === "Bool") {
        return !initial;
      }
      return index + 1;
    };

    const list = [
      {
        key: keys.MIN_HANDLE_EXECUTION_ERROR_GAS,
        initial: 1_200_000,
        type: "Uint",
      },
      {
        key: keys.MAX_SWAP_PATH_LENGTH,
        initial: 5,
        type: "Uint",
      },
      {
        key: keys.MAX_CALLBACK_GAS_LIMIT,
        initial: 2_000_000,
        type: "Uint",
      },
      {
        key: keys.MIN_POSITION_SIZE_USD,
        initial: decimalToFloat(1),
        type: "Uint",
      },
      {
        key: keys.MIN_ORACLE_BLOCK_CONFIRMATIONS,
        initial: 255,
        type: "Uint",
      },
      {
        key: keys.MAX_ORACLE_PRICE_AGE,
        initial: 300,
        type: "Uint",
      },
      {
        key: keys.MAX_ATOMIC_ORACLE_PRICE_AGE,
        initial: 30,
        type: "Uint",
      },
      {
        key: keys.MAX_ORACLE_REF_PRICE_DEVIATION_FACTOR,
        initial: decimalToFloat(5, 1),
        type: "Uint",
      },
      {
        key: keys.POSITION_FEE_RECEIVER_FACTOR,
        initial: 0,
        type: "Uint",
      },
      {
        key: keys.SWAP_FEE_RECEIVER_FACTOR,
        initial: 0,
        type: "Uint",
      },
      {
        key: keys.BORROWING_FEE_RECEIVER_FACTOR,
        initial: 0,
        type: "Uint",
      },
      {
        key: keys.ESTIMATED_GAS_FEE_BASE_AMOUNT_V2_1,
        initial: 0,
        type: "Uint",
      },
      {
        key: keys.ESTIMATED_GAS_FEE_PER_ORACLE_PRICE,
        initial: 0,
        type: "Uint",
      },
      {
        key: keys.ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR,
        initial: 0,
        type: "Uint",
      },
      {
        key: keys.SINGLE_SWAP_GAS_LIMIT,
        initial: 0,
        type: "Uint",
      },
      {
        key: keys.INCREASE_ORDER_GAS_LIMIT,
        initial: 0,
        type: "Uint",
      },
      {
        key: keys.DECREASE_ORDER_GAS_LIMIT,
        initial: 0,
        type: "Uint",
      },
      {
        key: keys.SWAP_ORDER_GAS_LIMIT,
        initial: 0,
        type: "Uint",
      },
      {
        key: keys.NATIVE_TOKEN_TRANSFER_GAS_LIMIT,
        initial: 50_000,
        type: "Uint",
      },
      {
        key: keys.REQUEST_EXPIRATION_TIME,
        initial: 300,
        type: "Uint",
      },
      {
        key: keys.MAX_UI_FEE_FACTOR,
        initial: decimalToFloat(5, 5),
        type: "Uint",
      },
      {
        key: keys.SKIP_BORROWING_FEE_FOR_SMALLER_SIDE,
        initial: false,
        type: "Bool",
      },
    ];

    for (let i = 0; i < list.length; i++) {
      const { key, initial, type } = list[i];
      const getMethod = `get${type}`;
      const setMethod = `set${type}`;
      expect(await dataStore[getMethod](key)).eq(initial, `initial ${i}: ${key}`);

      const value = getValue({ type, initial, index: i });
      await config.connect(user0)[setMethod](key, "0x", value);

      expect(await dataStore[getMethod](key)).eq(value, `after ${i}: ${key}`);
    }
  });

  it("sets max pnl factors", async () => {
    const key = keys.maxPnlFactorKey(keys.MAX_PNL_FACTOR_FOR_TRADERS, ethUsdMarket.marketToken, true);
    expect(await dataStore.getUint(key)).eq(decimalToFloat(5, 1));

    await config
      .connect(user0)
      .setUint(
        keys.MAX_PNL_FACTOR,
        encodeData(["bytes32", "address", "bool"], [keys.MAX_PNL_FACTOR_FOR_TRADERS, ethUsdMarket.marketToken, true]),
        700
      );

    expect(await dataStore.getUint(key)).eq(700);
  });

  it("setPositionImpactDistributionRate", async () => {
    await expect(
      config.connect(user1).setPositionImpactDistributionRate(ethUsdMarket.marketToken, 1, 2)
    ).to.be.revertedWithCustomError(errorsContract, "Unauthorized");

    expect(await dataStore.getUint(keys.minPositionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(0);
    expect(await dataStore.getUint(keys.positionImpactPoolDistributionRateKey(ethUsdMarket.marketToken))).eq(0);

    await config.connect(user0).setPositionImpactDistributionRate(ethUsdMarket.marketToken, 1, 2);

    expect(await dataStore.getUint(keys.minPositionImpactPoolAmountKey(ethUsdMarket.marketToken))).eq(1);
    expect(await dataStore.getUint(keys.positionImpactPoolDistributionRateKey(ethUsdMarket.marketToken))).eq(2);
  });

  it("setPositionImpactDistributionRate reverts if position impact pool is fully distributed in less than 1 week (604800 seconds)", async () => {
    const positionImpactPoolAmount = expandDecimals(200, 18); // 200 ETH
    await dataStore.setUint(keys.positionImpactPoolAmountKey(ethUsdMarket.marketToken), positionImpactPoolAmount);

    const minPositionImpactPoolAmount = 1;
    const invalidDistributionRate = expandDecimals(4, 44); // positionImpactPoolDistributionRate, 0.0004 ETH per second, 200 ETH for   500,0000 seconds
    const validDistributionRate = expandDecimals(2, 44); // positionImpactPoolDistributionRate, 0.0002 ETH per second, 200 ETH for 1,000,0000 seconds

    await expect(
      config.setPositionImpactDistributionRate(
        ethUsdMarket.marketToken,
        minPositionImpactPoolAmount,
        invalidDistributionRate
      )
    ).to.be.revertedWithCustomError(configUtils, "InvalidPositionImpactPoolDistributionRate");

    await expect(
      config.setPositionImpactDistributionRate(
        ethUsdMarket.marketToken,
        minPositionImpactPoolAmount,
        validDistributionRate
      )
    ).to.not.be.reverted;
  });

  it("setClaimableCollateralFactorForTime", async () => {
    await expect(
      config.connect(user1).setClaimableCollateralFactorForTime(
        ethUsdMarket.marketToken, // market
        wnt.address, // token
        100, // timeKey
        expandDecimals(1, 30).add(1) // factor
      )
    ).to.be.revertedWithCustomError(errorsContract, "Unauthorized");

    expect(await dataStore.getUint(keys.claimableCollateralFactorKey(ethUsdMarket.marketToken, wnt.address, 100))).eq(
      0
    );

    await expect(
      config
        .connect(user0)
        .setClaimableCollateralFactorForTime(ethUsdMarket.marketToken, wnt.address, 100, expandDecimals(1, 30).add(1))
    ).to.be.revertedWithCustomError(errorsContract, "InvalidClaimableFactor");

    await config
      .connect(user0)
      .setClaimableCollateralFactorForTime(ethUsdMarket.marketToken, wnt.address, 100, expandDecimals(1, 30));

    expect(await dataStore.getUint(keys.claimableCollateralFactorKey(ethUsdMarket.marketToken, wnt.address, 100))).eq(
      expandDecimals(1, 30)
    );
  });

  it("validates funding increase factor", async () => {
    const validValue = bigNumberify("100000000000000000000000").div(3600);
    await expect(
      config.setUint(
        keys.FUNDING_INCREASE_FACTOR_PER_SECOND,
        encodeData(["address"], [ethUsdMarket.marketToken]),
        validValue.add(100)
      )
    ).to.be.revertedWithCustomError(errorsContract, "ConfigValueExceedsAllowedRange");

    await config.setUint(
      keys.FUNDING_INCREASE_FACTOR_PER_SECOND,
      encodeData(["address"], [ethUsdMarket.marketToken]),
      validValue
    );

    const onchainValue = await dataStore.getUint(keys.fundingIncreaseFactorPerSecondKey(ethUsdMarket.marketToken));
    expect(onchainValue).eq(validValue);
  });

  it("validates min funding increase rate", async () => {
    const validValue = bigNumberify("100000000000000000000000");
    await expect(
      config.setUint(
        keys.MIN_FUNDING_INCREASE_RATE_PER_SECOND,
        encodeData(["address"], [ethUsdMarket.marketToken]),
        validValue.add(100)
      )
    ).to.be.revertedWithCustomError(errorsContract, "ConfigValueExceedsAllowedRange");

    await config.setUint(
      keys.MIN_FUNDING_INCREASE_RATE_PER_SECOND,
      encodeData(["address"], [ethUsdMarket.marketToken]),
      validValue
    );

    const onchainValue = await dataStore.getUint(keys.minFundingIncreaseRatePerSecondKey(ethUsdMarket.marketToken));
    expect(onchainValue).eq(validValue);
  });

  it("validates funding decrease factor", async () => {
    const validValue = bigNumberify("100000000000000000000000").div(86400);
    await expect(
      config.setUint(
        keys.FUNDING_DECREASE_FACTOR_PER_SECOND,
        encodeData(["address"], [ethUsdMarket.marketToken]),
        validValue.add(100)
      )
    ).to.be.revertedWithCustomError(errorsContract, "ConfigValueExceedsAllowedRange");

    await config.setUint(
      keys.FUNDING_DECREASE_FACTOR_PER_SECOND,
      encodeData(["address"], [ethUsdMarket.marketToken]),
      validValue
    );

    const onchainValue = await dataStore.getUint(keys.fundingDecreaseFactorPerSecondKey(ethUsdMarket.marketToken));
    expect(onchainValue).eq(validValue);
  });

  it("validates max funding fee factor is higher than min funding fee factor", async () => {
    await config.setUint(
      keys.MAX_FUNDING_FACTOR_PER_SECOND,
      encodeData(["address", "bool"], [ethUsdMarket.marketToken, true]),
      10
    );
    await config.setUint(
      keys.MAX_FUNDING_FACTOR_PER_SECOND,
      encodeData(["address", "bool"], [ethUsdMarket.marketToken, false]),
      10
    );
    await config.setUint(
      keys.MIN_FUNDING_FACTOR_PER_SECOND,
      encodeData(["address", "bool"], [ethUsdMarket.marketToken, true]),
      5
    );
    await config.setUint(
      keys.MIN_FUNDING_FACTOR_PER_SECOND,
      encodeData(["address", "bool"], [ethUsdMarket.marketToken, false]),
      5
    );

    await expect(
      config.setUint(
        keys.MIN_FUNDING_FACTOR_PER_SECOND,
        encodeData(["address", "bool"], [ethUsdMarket.marketToken, true]),
        11
      )
    ).to.be.revertedWithCustomError(errorsContract, "ConfigValueExceedsAllowedRange");

    await expect(
      config.setUint(
        keys.MAX_FUNDING_FACTOR_PER_SECOND,
        encodeData(["address", "bool"], [ethUsdMarket.marketToken, true]),
        4
      )
    ).to.be.revertedWithCustomError(errorsContract, "ConfigValueExceedsAllowedRange");
  });

  it("validates max borrowing factor per second", async () => {
    const maxAllowedValue = await configUtils.MAX_ALLOWED_MAX_BORROWING_FACTOR_PER_SECOND();
    const dataForLongs = encodeData(["address", "bool"], [ethUsdMarket.marketToken, true]);
    const dataForShorts = encodeData(["address", "bool"], [ethUsdMarket.marketToken, false]);

    await expect(
      config.connect(user0).setUint(keys.MAX_BORROWING_FACTOR_PER_SECOND, dataForLongs, maxAllowedValue.add(1))
    )
      .to.be.revertedWithCustomError(errorsContract, "ConfigValueExceedsAllowedRange")
      .withArgs(keys.MAX_BORROWING_FACTOR_PER_SECOND, maxAllowedValue.add(1));

    await config.connect(user0).setUint(keys.MAX_BORROWING_FACTOR_PER_SECOND, dataForLongs, maxAllowedValue);
    await config.connect(user0).setUint(keys.MAX_BORROWING_FACTOR_PER_SECOND, dataForShorts, maxAllowedValue.sub(1));

    expect(await dataStore.getUint(keys.maxBorrowingFactorPerSecondKey(ethUsdMarket.marketToken, true))).eq(
      maxAllowedValue
    );
    expect(await dataStore.getUint(keys.maxBorrowingFactorPerSecondKey(ethUsdMarket.marketToken, false))).eq(
      maxAllowedValue.sub(1)
    );
  });

  it("validates data stream spread reduction factor", async () => {
    const p100 = percentageToFloat("100%");

    await expect(
      config.setUint(keys.DATA_STREAM_SPREAD_REDUCTION_FACTOR, encodeData(["address"], [wnt.address]), p100.add(1))
    ).to.be.revertedWithCustomError(errorsContract, "ConfigValueExceedsAllowedRange");

    await config.setUint(keys.DATA_STREAM_SPREAD_REDUCTION_FACTOR, encodeData(["address"], [wnt.address]), p100);
  });

  it("initOracleConfig", async () => {
    const token = { address: "0x7f9FBf9bDd3F4105C478b996B648FE6e828a1e98" };
    expect(await dataStore.getAddress(keys.priceFeedKey(token.address))).eq(ethers.constants.AddressZero);
    expect(await dataStore.getUint(keys.priceFeedMultiplierKey(token.address))).eq(0);
    expect(await dataStore.getUint(keys.priceFeedHeartbeatDurationKey(token.address))).eq(0);
    expect(await dataStore.getUint(keys.stablePriceKey(token.address))).eq(0);

    expect(await dataStore.getBytes32(keys.dataStreamIdKey(token.address))).eq(ethers.constants.HashZero);
    expect(await dataStore.getUint(keys.dataStreamMultiplierKey(token.address))).eq(0);
    expect(await dataStore.getUint(keys.dataStreamSpreadReductionFactorKey(token.address))).eq(0);
    expect(await dataStore.getUint(keys.edgeDataStreamIdKey(token.address))).eq(0);

    const oracleConfig = {
      token: token.address,
      priceFeed: {
        feedAddress: "0x221912ce795669f628c51c69b7d0873eDA9C03bB",
        multiplier: expandDecimals(1, 60 - 18 - 8),
        heartbeatDuration: (24 + 1) * 60 * 60,
        stablePrice: decimalToFloat(100),
      },
      dataStream: {
        feedId: hashString("WNT"),
        multiplier: expandDecimals(1, 60 - 6 - 18),
        spreadReductionFactor: percentageToFloat("100%"),
      },
      edge: {
        feedId: hashString("WNT-EDGE"),
        tokenDecimals: 15,
      },
    };

    // invalid price feed
    await expect(config.initOracleConfig(oracleConfig)).to.be.revertedWithCustomError(
      errorsContract,
      "InvalidPriceFeed"
    );

    // valid price feed
    const mockPriceFeedFactory = await ethers.getContractFactory("MockPriceFeed");
    const mockedPriceFeed = await mockPriceFeedFactory.deploy();
    await mockedPriceFeed.deployed();
    oracleConfig.priceFeed.feedAddress = mockedPriceFeed.address;
    await config.initOracleConfig(oracleConfig);

    expect(await dataStore.getAddress(keys.priceFeedKey(token.address))).eq(oracleConfig.priceFeed.feedAddress);
    expect(await dataStore.getUint(keys.priceFeedMultiplierKey(token.address))).eq(oracleConfig.priceFeed.multiplier);
    expect(await dataStore.getUint(keys.priceFeedHeartbeatDurationKey(token.address))).eq(
      oracleConfig.priceFeed.heartbeatDuration
    );
    expect(await dataStore.getUint(keys.stablePriceKey(token.address))).eq(decimalToFloat(100));

    expect(await dataStore.getBytes32(keys.dataStreamIdKey(token.address))).eq(oracleConfig.dataStream.feedId);
    expect(await dataStore.getUint(keys.dataStreamMultiplierKey(token.address))).eq(oracleConfig.dataStream.multiplier);
    expect(await dataStore.getUint(keys.dataStreamSpreadReductionFactorKey(token.address))).eq(
      oracleConfig.dataStream.spreadReductionFactor
    );
    expect(await dataStore.getBytes32(keys.edgeDataStreamIdKey(token.address))).eq(oracleConfig.edge.feedId);
    expect(await dataStore.getUint(keys.edgeDataStreamTokenDecimalsKey(token.address))).eq(
      oracleConfig.edge.tokenDecimals
    );

    await expect(config.initOracleConfig(oracleConfig)).to.be.revertedWithCustomError(
      errorsContract,
      "PriceFeedAlreadyExistsForToken"
    );
  });

  it("setClaimableCollateralFactorForAccount", async () => {
    await expect(
      config.connect(user1).setClaimableCollateralFactorForAccount(
        ethUsdMarket.marketToken, // market
        wnt.address, // token
        100, // timeKey
        user1.address,
        expandDecimals(1, 30).add(1) // factor
      )
    ).to.be.revertedWithCustomError(errorsContract, "Unauthorized");

    expect(
      await dataStore.getUint(
        keys.claimableCollateralFactorForAccountKey(ethUsdMarket.marketToken, wnt.address, 100, user1.address)
      )
    ).eq(0);

    await expect(
      config
        .connect(user0)
        .setClaimableCollateralFactorForAccount(
          ethUsdMarket.marketToken,
          wnt.address,
          100,
          user1.address,
          expandDecimals(1, 30).add(1)
        )
    ).to.be.revertedWithCustomError(errorsContract, "InvalidClaimableFactor");

    await config
      .connect(user0)
      .setClaimableCollateralFactorForAccount(
        ethUsdMarket.marketToken,
        wnt.address,
        100,
        user1.address,
        expandDecimals(1, 30)
      );

    expect(
      await dataStore.getUint(
        keys.claimableCollateralFactorForAccountKey(ethUsdMarket.marketToken, wnt.address, 100, user1.address)
      )
    ).eq(expandDecimals(1, 30));
  });

  it("validates reserve factors", async () => {
    const ten = expandDecimals(10, 30);

    await expect(
      config.setUint(
        keys.RESERVE_FACTOR,
        encodeData(["address", "bool"], [ethUsdMarket.marketToken, false]),
        ten.add("1")
      )
    ).to.be.revertedWithCustomError(errorsContract, "ConfigValueExceedsAllowedRange");

    await config.setUint(keys.RESERVE_FACTOR, encodeData(["address", "bool"], [ethUsdMarket.marketToken, false]), ten);

    const reserveFactorKey = keys.reserveFactorKey(ethUsdMarket.marketToken, false);
    expect(await dataStore.getUint(reserveFactorKey)).eq(ten);

    await expect(
      config.setUint(
        keys.OPEN_INTEREST_RESERVE_FACTOR,
        encodeData(["address", "bool"], [ethUsdMarket.marketToken, false]),
        ten.add("1")
      )
    ).to.be.revertedWithCustomError(errorsContract, "ConfigValueExceedsAllowedRange");

    await config.setUint(
      keys.OPEN_INTEREST_RESERVE_FACTOR,
      encodeData(["address", "bool"], [ethUsdMarket.marketToken, false]),
      ten
    );
    const oiReserveFactorKey = keys.openInterestReserveFactorKey(ethUsdMarket.marketToken, false);
    expect(await dataStore.getUint(oiReserveFactorKey)).eq(ten);
  });

  describe("setOracleProviderForToken", async () => {
    let oracleProvider1, oracleProvider2;

    beforeEach(async () => {
      const mockOracleProviderFactory = await ethers.getContractFactory("MockOracleProvider");
      oracleProvider1 = await mockOracleProviderFactory.deploy();
      oracleProvider2 = await mockOracleProviderFactory.deploy();

      await dataStore.setBool(keys.isOracleProviderEnabledKey(oracleProvider1.address), true);
      await dataStore.setBool(keys.isOracleProviderEnabledKey(oracleProvider2.address), true);
    });

    it("only allows config keeper to set oracle provider", async () => {
      await expect(
        config.connect(user1).setOracleProviderForToken(oracle.address, wnt.address, oracleProvider1.address)
      ).to.be.revertedWithCustomError(errorsContract, "Unauthorized");
    });

    it("validates token address is not zero", async () => {
      await expect(
        config
          .connect(user0)
          .setOracleProviderForToken(oracle.address, ethers.constants.AddressZero, oracleProvider1.address)
      ).to.be.revertedWithCustomError(errorsContract, "EmptyToken");
    });

    it("validates oracle provider is enabled", async () => {
      const disabledProvider = await (await ethers.getContractFactory("MockOracleProvider")).deploy();
      await expect(
        config.connect(user0).setOracleProviderForToken(oracle.address, wnt.address, disabledProvider.address)
      ).to.be.revertedWithCustomError(errorsContract, "InvalidOracleProvider");
    });

    it("allows changing to different provider without delay", async () => {
      await config.connect(user0).setOracleProviderForToken(oracle.address, wnt.address, oracleProvider1.address);
      await config.connect(user0).setOracleProviderForToken(oracle.address, wnt.address, oracleProvider2.address);
    });

    it("enforces delay between updates for same provider", async () => {
      await config.connect(user0).setOracleProviderForToken(oracle.address, wnt.address, oracleProvider1.address);
      await config.connect(user0).setOracleProviderForToken(oracle.address, wnt.address, oracleProvider2.address);
      // Try to set the same provider again immediately
      await expect(
        config.connect(user0).setOracleProviderForToken(oracle.address, wnt.address, oracleProvider1.address)
      ).to.be.revertedWithCustomError(errorsContract, "OracleProviderMinChangeDelayNotYetPassed");

      const delay = await dataStore.getUint(keys.ORACLE_PROVIDER_MIN_CHANGE_DELAY);
      await mine(delay.toNumber());

      // Should succeed after delay
      await config.connect(user0).setOracleProviderForToken(oracle.address, wnt.address, oracleProvider1.address);
    });

    it("updates provider and timestamp correctly", async () => {
      const tx = await config
        .connect(user0)
        .setOracleProviderForToken(oracle.address, wnt.address, oracleProvider1.address);
      const timestamp = (await ethers.provider.getBlock(tx.blockNumber)).timestamp;

      expect(await dataStore.getAddress(keys.oracleProviderForTokenKey(oracle.address, wnt.address))).to.equal(
        oracleProvider1.address
      );
      expect(await dataStore.getUint(keys.oracleProviderUpdatedAtKey(wnt.address, oracleProvider1.address))).to.equal(
        timestamp
      );
    });
  });
});
