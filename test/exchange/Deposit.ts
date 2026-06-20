import { expect } from "chai";

import { usingResult } from "../../utils/use";
import { deployFixture } from "../../utils/fixture";
import { deployContract } from "../../utils/deploy";
import { bigNumberify, expandDecimals, decimalToFloat } from "../../utils/math";
import { getBalanceOf, getSupplyOf } from "../../utils/token";
import { getClaimableFeeAmount } from "../../utils/fee";
import {
  getPoolAmount,
  getSwapImpactPoolAmount,
  getMarketTokenPrice,
  getMarketTokenPriceWithPoolValue,
} from "../../utils/market";
import { getDepositCount, getDepositKeys, createDeposit, executeDeposit, handleDeposit } from "../../utils/deposit";
import { getExecuteParams } from "../../utils/exchange";
import { errorsContract } from "../../utils/error";
import * as keys from "../../utils/keys";
import { TOKEN_ORACLE_TYPES } from "../../utils/oracle";
import { SwapPricingType } from "../../utils/swap";
import { prices } from "../../utils/prices";

describe("Exchange.Deposit", () => {
  const { provider } = ethers;
  const { AddressZero, HashZero } = ethers.constants;

  let fixture;
  let user0, user1, user2;
  let reader,
    dataStore,
    exchangeRouter,
    depositVault,
    depositHandler,
    depositStoreUtils,
    ethUsdMarket,
    ethUsdSpotOnlyMarket,
    ethUsdSingleTokenMarket,
    btcUsdMarket,
    wnt,
    usdc,
    wbtc;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ user0, user1, user2 } = fixture.accounts);
    ({
      reader,
      dataStore,
      exchangeRouter,
      depositVault,
      depositHandler,
      depositStoreUtils,
      ethUsdMarket,
      ethUsdSpotOnlyMarket,
      ethUsdSingleTokenMarket,
      btcUsdMarket,
      wnt,
      usdc,
      wbtc,
    } = fixture.contracts);
  });

  it("createDeposit validations", async () => {
    const params = {
      receiver: user1,
      callbackContract: user2,
      market: ethUsdMarket,
      longTokenSwapPath: [ethUsdMarket.marketToken, ethUsdSpotOnlyMarket.marketToken],
      shortTokenSwapPath: [ethUsdSpotOnlyMarket.marketToken, ethUsdMarket.marketToken],
      minMarketTokens: 100,
      shouldUnwrapNativeToken: true,
      executionFee: "0",
      callbackGasLimit: "200000",
      gasUsageLabel: "createDeposit",
    };

    const _createDepositFeatureDisabledKey = keys.createDepositFeatureDisabledKey(depositHandler.address);

    await dataStore.setBool(_createDepositFeatureDisabledKey, true);

    await expect(createDeposit(fixture, { ...params, sender: user0 }))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user0.address, "CONTROLLER");

    await expect(createDeposit(fixture, params))
      .to.be.revertedWithCustomError(errorsContract, "DisabledFeature")
      .withArgs(_createDepositFeatureDisabledKey);

    await dataStore.setBool(_createDepositFeatureDisabledKey, false);

    await expect(
      createDeposit(fixture, { ...params, account: { address: AddressZero } })
    ).to.be.revertedWithCustomError(errorsContract, "EmptyAccount");

    await expect(
      createDeposit(fixture, {
        ...params,
        market: { marketToken: user1.address, longToken: wnt.address, shortToken: usdc.address },
      })
    ).to.be.revertedWithCustomError(errorsContract, "EmptyMarket");

    const _isMarketDisabledKey = keys.isMarketDisabledKey(ethUsdMarket.marketToken);
    await dataStore.setBool(_isMarketDisabledKey, true);

    await expect(createDeposit(fixture, params))
      .to.be.revertedWithCustomError(errorsContract, "DisabledMarket")
      .withArgs(ethUsdMarket.marketToken);

    await dataStore.setBool(_isMarketDisabledKey, false);

    await expect(
      createDeposit(fixture, {
        ...params,
        market: btcUsdMarket,
        longTokenAmount: expandDecimals(10, 18),
        shortTokenAmount: expandDecimals(10 * 5000, 6),
        executionFee: "500",
        executionFeeToMint: "200",
      })
    )
      .to.be.revertedWithCustomError(errorsContract, "InsufficientWntAmountForExecutionFee")
      .withArgs("200", "500");

    await wnt.mint(depositVault.address, "1000");
    await createDeposit(fixture, {
      ...params,
      market: btcUsdMarket,
      longTokenAmount: expandDecimals(10, 18),
      shortTokenAmount: expandDecimals(10 * 5000, 6),
      executionFee: "500",
    });

    const depositKeys = await getDepositKeys(dataStore, 0, 1);
    const deposit = await reader.getDeposit(dataStore.address, depositKeys[0]);

    // even though the params.executionFee is specified to be 500
    // the executionFee should be recorded as 1700 because 200 wnt was previously minted to depositVault
    // in addition to the 1000 wnt was minted and 500 wnt minted for the execution fee
    expect(deposit.numbers.executionFee).eq("1700");

    await expect(createDeposit(fixture, params)).to.be.revertedWithCustomError(errorsContract, "EmptyDepositAmounts");

    await expect(
      createDeposit(fixture, { ...params, longTokenAmount: bigNumberify(1), receiver: { address: AddressZero } })
    ).to.be.revertedWithCustomError(errorsContract, "EmptyReceiver");

    await expect(createDeposit(fixture, { ...params, longTokenAmount: bigNumberify(1), callbackGasLimit: "3000000" }))
      .to.be.revertedWithCustomError(errorsContract, "MaxCallbackGasLimitExceeded")
      .withArgs("3000000", "2000000");

    await dataStore.setUint(keys.ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR, decimalToFloat(1));

    await expect(
      createDeposit(fixture, {
        ...params,
        longTokenAmount: bigNumberify(1),
        callbackGasLimit: "2000000",
        executionFee: "3000",
      })
    )
      .to.be.revertedWithCustomError(errorsContract, "InsufficientExecutionFee")
      .withArgs("2000000016000000", "3000");
  });

  it("createDeposit", async () => {
    await dataStore.setUint(keys.MAX_DATA_LENGTH, 256);
    const dataList = [ethers.utils.formatBytes32String("customData")];
    const params = {
      receiver: user1,
      callbackContract: user2,
      market: ethUsdMarket,
      initialLongToken: ethUsdMarket.longToken,
      initialShortToken: ethUsdMarket.shortToken,
      longTokenSwapPath: [ethUsdMarket.marketToken, ethUsdSpotOnlyMarket.marketToken],
      shortTokenSwapPath: [ethUsdSpotOnlyMarket.marketToken, ethUsdMarket.marketToken],
      minMarketTokens: 100,
      shouldUnwrapNativeToken: true,
      executionFee: "0",
      callbackGasLimit: "200000",
      gasUsageLabel: "createDeposit",
      dataList,
    };

    await createDeposit(fixture, {
      ...params,
      longTokenAmount: expandDecimals(10, 18),
      shortTokenAmount: expandDecimals(10 * 5000, 6),
      executionFee: "500",
    });

    const depositKeys = await getDepositKeys(dataStore, 0, 1);
    const deposit = await reader.getDeposit(dataStore.address, depositKeys[0]);

    expect(deposit.addresses.account).eq(user0.address);
    expect(deposit.addresses.receiver).eq(user1.address);
    expect(deposit.addresses.callbackContract).eq(user2.address);
    expect(deposit.addresses.market).eq(ethUsdMarket.marketToken);
    expect(deposit.addresses.initialLongToken).eq(ethUsdMarket.longToken);
    expect(deposit.addresses.initialShortToken).eq(ethUsdMarket.shortToken);
    expect(deposit.addresses.longTokenSwapPath).deep.eq([ethUsdMarket.marketToken, ethUsdSpotOnlyMarket.marketToken]);
    expect(deposit.addresses.shortTokenSwapPath).deep.eq([ethUsdSpotOnlyMarket.marketToken, ethUsdMarket.marketToken]);
    expect(deposit.numbers.initialLongTokenAmount).eq(expandDecimals(10, 18));
    expect(deposit.numbers.initialShortTokenAmount).eq(expandDecimals(10 * 5000, 6));
    expect(deposit.numbers.minMarketTokens).eq(100);
    expect(deposit.numbers.uiFeeFactor).eq(0);
    expect(deposit.numbers.executionFee).eq("500");
    expect(deposit.numbers.callbackGasLimit).eq("200000");
    expect(deposit.flags.shouldUnwrapNativeToken).eq(true);
    expect(deposit._dataList).deep.eq(dataList);
  });

  it("snapshots uiFeeFactor for deposit execution", async () => {
    const lowUiFeeFactor = decimalToFloat(1, 3); // 0.1%
    const highUiFeeFactor = decimalToFloat(1, 2); // 1%
    const depositAmount = expandDecimals(10_000, 6);

    await dataStore.setUint(keys.MAX_UI_FEE_FACTOR, highUiFeeFactor);
    await exchangeRouter.connect(user1).setUiFeeFactor(lowUiFeeFactor);

    await createDeposit(fixture, {
      receiver: user0,
      uiFeeReceiver: user1,
      shortTokenAmount: depositAmount,
    });

    const depositKeys = await getDepositKeys(dataStore, 0, 1);
    const deposit = await reader.getDeposit(dataStore.address, depositKeys[0]);
    expect(deposit.numbers.uiFeeFactor).eq(lowUiFeeFactor);

    await exchangeRouter.connect(user1).setUiFeeFactor(highUiFeeFactor);
    await executeDeposit(fixture);

    const claimableUiFeeAmount = await dataStore.getUint(
      keys.claimableUiFeeAmountKey(ethUsdMarket.marketToken, usdc.address, user1.address)
    );

    expect(claimableUiFeeAmount).eq(expandDecimals(10, 6));
  });

  it("cancelDeposit", async () => {
    await createDeposit(fixture, {
      receiver: user1,
      callbackContract: user2,
      market: ethUsdMarket,
      longTokenAmount: expandDecimals(10, 18),
      shortTokenAmount: expandDecimals(10 * 5000, 6),
      initialLongToken: ethUsdMarket.longToken,
      initialShortToken: ethUsdMarket.shortToken,
      longTokenSwapPath: [ethUsdMarket.marketToken, ethUsdSpotOnlyMarket.marketToken],
      shortTokenSwapPath: [ethUsdSpotOnlyMarket.marketToken, ethUsdMarket.marketToken],
      minMarketTokens: 100,
      shouldUnwrapNativeToken: true,
      executionFee: "500",
      callbackGasLimit: "200000",
    });

    const depositKeys = await getDepositKeys(dataStore, 0, 1);

    const _cancelDepositFeatureDisabledKey = keys.cancelDepositFeatureDisabledKey(depositHandler.address);

    await dataStore.setBool(_cancelDepositFeatureDisabledKey, true);

    await expect(depositHandler.connect(user0).cancelDeposit(depositKeys[0]))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user0.address, "ORDER_KEEPER|CONTROLLER");

    await expect(depositHandler.cancelDeposit(depositKeys[0]))
      .to.be.revertedWithCustomError(errorsContract, "DisabledFeature")
      .withArgs(_cancelDepositFeatureDisabledKey);
  });

  it("executeDeposit validations", async () => {
    await expect(
      depositHandler.connect(user0).executeDeposit(HashZero, {
        tokens: [],
        providers: [],
        data: [],
      })
    )
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user0.address, "ORDER_KEEPER");

    await createDeposit(fixture, {
      receiver: user1,
      market: ethUsdMarket,
      longTokenAmount: expandDecimals(10, 18),
      shortTokenAmount: expandDecimals(9 * 5000, 6),
      minMarketTokens: 100,
      gasUsageLabel: "createDeposit",
    });

    const depositKeys = await getDepositKeys(dataStore, 0, 1);
    let deposit = await reader.getDeposit(dataStore.address, depositKeys[0]);

    expect(deposit.addresses.account).eq(user0.address);
    expect(await getDepositCount(dataStore)).eq(1);

    const _executeDepositFeatureDisabledKey = keys.executeDepositFeatureDisabledKey(depositHandler.address);
    await dataStore.setBool(_executeDepositFeatureDisabledKey, true);

    await expect(
      executeDeposit(fixture, {
        tokens: [wnt.address],
        tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      })
    )
      .to.be.revertedWithCustomError(errorsContract, "DisabledFeature")
      .withArgs(_executeDepositFeatureDisabledKey);

    await dataStore.setBool(_executeDepositFeatureDisabledKey, false);

    await expect(
      executeDeposit(fixture, {
        tokens: [wnt.address],
        tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT],
        minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
      })
    )
      .to.be.revertedWithCustomError(errorsContract, "EmptyPrimaryPrice")
      .withArgs(usdc.address);

    await executeDeposit(fixture, { gasUsageLabel: "executeDeposit" });

    deposit = await reader.getDeposit(dataStore.address, depositKeys[0]);

    expect(deposit.addresses.account).eq(AddressZero);
    expect(await getBalanceOf(ethUsdMarket.marketToken, user1.address)).eq(expandDecimals(95000, 18));
    expect(await getDepositCount(dataStore)).eq(0);

    await expect(
      executeDeposit(fixture, {
        depositKey: HashZero,
        oracleBlockNumber: (await provider.getBlock()).number,
        gasUsageLabel: "executeDeposit",
      })
    ).to.be.revertedWithCustomError(errorsContract, "EmptyDeposit");

    await dataStore.setUint(keys.maxPoolAmountKey(ethUsdMarket.marketToken, wnt.address), expandDecimals(1, 18));

    await handleDeposit(fixture, {
      create: {
        longTokenAmount: expandDecimals(2, 18),
        shortTokenAmount: expandDecimals(10_000, 6),
      },
      execute: {
        expectedCancellationReason: "MaxPoolAmountExceeded",
      },
    });

    await dataStore.setUint(keys.maxPoolAmountKey(ethUsdMarket.marketToken, wnt.address), expandDecimals(5, 18));
    await dataStore.setUint(keys.maxPoolUsdForDepositKey(ethUsdMarket.marketToken, wnt.address), decimalToFloat(1));

    await handleDeposit(fixture, {
      create: {
        longTokenAmount: expandDecimals(2, 18),
        shortTokenAmount: expandDecimals(10_000, 6),
      },
      execute: {
        expectedCancellationReason: "MaxPoolUsdForDepositExceeded",
      },
    });
  });

  it("executeDeposit succeeds when borrowing accrual sees zero pool value", async () => {
    await dataStore.setUint(keys.openInterestKey(ethUsdMarket.marketToken, wnt.address, true), decimalToFloat(5000));
    await dataStore.setUint(
      keys.openInterestInTokensKey(ethUsdMarket.marketToken, wnt.address, true),
      expandDecimals(1, 18)
    );
    await dataStore.setUint(keys.openInterestKey(ethUsdMarket.marketToken, usdc.address, false), decimalToFloat(5000));
    await dataStore.setUint(
      keys.openInterestInTokensKey(ethUsdMarket.marketToken, usdc.address, false),
      expandDecimals(1, 18)
    );

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(10, 18),
      },
    });

    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).gt(0);
  });

  it("executeDeposit with swap", async () => {
    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq(0);

    await handleDeposit(fixture, {
      create: {
        longTokenAmount: expandDecimals(10, 18),
        shortTokenAmount: expandDecimals(9 * 5000, 6),
      },
    });

    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq(expandDecimals(95000, 18));

    await handleDeposit(fixture, {
      create: {
        initialLongToken: usdc.address,
        longTokenAmount: expandDecimals(9 * 5000, 6),
        initialShortToken: wnt.address,
        shortTokenAmount: expandDecimals(10, 18),
        longTokenSwapPath: [ethUsdMarket.marketToken],
        shortTokenSwapPath: [ethUsdMarket.marketToken],
      },
    });

    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq(expandDecimals(190000, 18));

    await handleDeposit(fixture, {
      create: {
        account: user1,
        market: btcUsdMarket,
        longTokenAmount: expandDecimals(2, 8),
        shortTokenAmount: expandDecimals(10, 18),
      },
      execute: getExecuteParams(fixture, { tokens: [usdc, wbtc] }),
    });

    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq(expandDecimals(190000, 18));

    await handleDeposit(fixture, {
      create: {
        initialLongToken: usdc.address,
        longTokenAmount: expandDecimals(9 * 5000, 6),
        initialShortToken: wnt.address,
        shortTokenAmount: expandDecimals(10, 18),
        longTokenSwapPath: [btcUsdMarket.marketToken],
        shortTokenSwapPath: [ethUsdMarket.marketToken],
      },
      execute: {
        ...getExecuteParams(fixture, { tokens: [wnt, usdc, wbtc] }),
        expectedCancellationReason: "InvalidSwapOutputToken",
      },
    });

    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq(expandDecimals(190000, 18));

    await handleDeposit(fixture, {
      create: {
        longTokenAmount: expandDecimals(10, 18),
        shortTokenAmount: expandDecimals(9 * 5000, 6),
        minMarketTokens: expandDecimals(500000, 18),
      },
      execute: {
        expectedCancellationReason: "MinMarketTokens",
      },
    });

    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq(expandDecimals(190000, 18));
  });

  it("_executeDeposit", async () => {
    const depositStoreUtilsTest = await deployContract("DepositStoreUtilsTest", [], {
      libraries: {
        DepositStoreUtils: depositStoreUtils.address,
      },
    });

    const emptyDeposit = await depositStoreUtilsTest.getEmptyDeposit();

    await expect(depositHandler.connect(user0)._executeDeposit(HashZero, emptyDeposit, user0.address))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user0.address, "SELF");
  });

  it("executeDeposit, spot only market", async () => {
    const revertingCallbackReceiver = await deployContract("RevertingCallbackReceiver", []);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdSpotOnlyMarket,
        longTokenAmount: expandDecimals(10, 18),
        callbackContract: user2,
      },
    });

    expect(await getDepositCount(dataStore)).eq(0);
    expect(
      await getMarketTokenPrice(fixture, {
        market: ethUsdSpotOnlyMarket,
        indexTokenPrice: { min: 0, max: 0 },
      })
    ).eq(expandDecimals(1, 30));

    expect(await getBalanceOf(ethUsdSpotOnlyMarket.marketToken, user0.address)).eq("50000000000000000000000"); // 50,000
    expect(await wnt.balanceOf(depositVault.address)).eq(0);
    expect(await usdc.balanceOf(depositVault.address)).eq(0);

    expect(await wnt.balanceOf(ethUsdSpotOnlyMarket.marketToken)).eq(expandDecimals(10, 18));
    expect(await usdc.balanceOf(ethUsdSpotOnlyMarket.marketToken)).eq(0);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdSpotOnlyMarket,
        shortTokenAmount: expandDecimals(25 * 1000, 6),
        callbackContract: revertingCallbackReceiver,
      },
    });

    expect(await getBalanceOf(ethUsdSpotOnlyMarket.marketToken, user0.address)).eq("75000000000000000000000"); // 75,000
    expect(await wnt.balanceOf(depositVault.address)).eq(0);
    expect(await usdc.balanceOf(depositVault.address)).eq(0);

    expect(await wnt.balanceOf(ethUsdSpotOnlyMarket.marketToken)).eq(expandDecimals(10, 18));
    expect(await usdc.balanceOf(ethUsdSpotOnlyMarket.marketToken)).eq(expandDecimals(25 * 1000, 6));
  });

  it("price impact", async () => {
    // set price impact to 0.1% for every $100,000 of token imbalance
    // 0.1% => 0.001
    // 0.001 / 100,000 => 1 * (10 ** -8)
    await dataStore.setUint(keys.swapImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(1, 8));
    await dataStore.setUint(keys.swapImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(1, 8));
    await dataStore.setUint(keys.swapImpactExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));

    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq(0);
    expect(await wnt.balanceOf(depositVault.address)).eq(0);
    expect(await usdc.balanceOf(depositVault.address)).eq(0);

    expect(await wnt.balanceOf(ethUsdMarket.marketToken)).eq(0);
    expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(0);
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(0);
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(0);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(10, 18),
      },
      execute: {
        gasUsageLabel: "executeDeposit",
      },
    });

    expect(await getDepositCount(dataStore)).eq(0);
    expect(await getMarketTokenPrice(fixture)).eq(expandDecimals(1, 30));

    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq("49975000000000000000000");
    expect(await wnt.balanceOf(depositVault.address)).eq(0);
    expect(await usdc.balanceOf(depositVault.address)).eq(0);

    expect(await wnt.balanceOf(ethUsdMarket.marketToken)).eq(expandDecimals(10, 18));
    expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(0);
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq("9995000000000000000");
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(0);
    expect(await getSwapImpactPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(
      "5000000000000000" // 0.005 ETH, 25 USD
    );

    expect(await getBalanceOf(ethUsdMarket.marketToken, user1.address)).eq(0);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        shortTokenAmount: expandDecimals(49975, 6),
        receiver: user1,
      },
      execute: {
        gasUsageLabel: "executeDeposit",
      },
    });

    expect(await getMarketTokenPrice(fixture)).eq(expandDecimals(1, 30));

    expect(await getBalanceOf(ethUsdMarket.marketToken, user1.address)).eq("49999975000012490625000"); // 49999.975000012490625
  });

  it("positive and negative price impact", async () => {
    // set negative price impact to 0.1% for every $100,000 of token imbalance
    // 0.1% => 0.001
    // 0.001 / 100,000 => 1 * (10 ** -8)
    // set positive price impact to 0.05% for every $100,000 of token imbalance
    // 0.05% => 0.0005
    // 0.0005 / 100,000 => 5 * (10 ** -9)
    await dataStore.setUint(keys.swapImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(1, 8));
    await dataStore.setUint(keys.swapImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(5, 9));
    await dataStore.setUint(keys.swapImpactExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));

    expect(
      await reader.getDepositAmountOut(
        dataStore.address,
        ethUsdMarket,
        prices.ethUsdMarket,
        expandDecimals(10, 18), // longTokenAmount
        0, // shortTokenAmount
        AddressZero,
        SwapPricingType.TwoStep,
        true // includeVirtualInventoryImpact
      )
    ).eq("49975000000000000000000");

    expect(
      await reader.getDepositAmountOut(
        dataStore.address,
        ethUsdMarket,
        prices.ethUsdMarket,
        expandDecimals(10, 18), // longTokenAmount
        expandDecimals(1000, 6), // shortTokenAmount
        AddressZero,
        SwapPricingType.TwoStep,
        true // includeVirtualInventoryImpact
      )
    ).eq("50975989999313725490000");

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(10, 18),
      },
      execute: {
        gasUsageLabel: "executeDeposit",
      },
    });

    expect(await getMarketTokenPrice(fixture)).eq(expandDecimals(1, 30));

    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq("49975000000000000000000");
    expect(await wnt.balanceOf(depositVault.address)).eq(0);
    expect(await usdc.balanceOf(depositVault.address)).eq(0);

    expect(await wnt.balanceOf(ethUsdMarket.marketToken)).eq(expandDecimals(10, 18));
    expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(0);
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq("9995000000000000000");
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(0);
    expect(await getSwapImpactPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(
      "5000000000000000" // 0.005 ETH, 25 USD
    );

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        shortTokenAmount: expandDecimals(49975, 6),
        receiver: user1,
      },
      execute: {
        gasUsageLabel: "executeDeposit",
      },
    });

    expect(await getMarketTokenPrice(fixture)).eq(expandDecimals(1, 30));

    expect(await getBalanceOf(ethUsdMarket.marketToken, user1.address)).eq("49987487502345311325000"); // 49987.487502345311325
  });

  it("price impact split over multiple orders", async () => {
    // set negative price impact to 0.1% for every $100,000 of token imbalance
    // 0.1% => 0.001
    // 0.001 / 100,000 => 1 * (10 ** -8)
    // set positive price impact to 0.05% for every $100,000 of token imbalance
    // 0.05% => 0.0005
    // 0.0005 / 100,000 => 5 * (10 ** -9)
    await dataStore.setUint(keys.swapImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(1, 8));
    await dataStore.setUint(keys.swapImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(5, 9));
    await dataStore.setUint(keys.swapImpactExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(5, 18),
      },
      execute: {
        gasUsageLabel: "executeDeposit",
      },
    });

    expect(await getMarketTokenPrice(fixture)).eq(expandDecimals(1, 30));

    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq("24993750000000000000000");
    expect(await wnt.balanceOf(depositVault.address)).eq(0);
    expect(await usdc.balanceOf(depositVault.address)).eq(0);

    expect(await wnt.balanceOf(ethUsdMarket.marketToken)).eq(expandDecimals(5, 18));
    expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(0);
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(
      "4998750000000000000" // 4.99875
    );
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(0);
    expect(await getSwapImpactPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(
      "1250000000000000" // 0.00125 ETH, 6.25 USD
    );

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(5, 18),
        receiver: user1,
      },
      execute: {
        gasUsageLabel: "executeDeposit",
      },
    });

    expect(await getMarketTokenPrice(fixture)).eq(expandDecimals(1, 30));

    expect(await getBalanceOf(ethUsdMarket.marketToken, user1.address)).eq("24981253125000000000000"); // 24981.253125

    expect(await wnt.balanceOf(ethUsdMarket.marketToken)).eq(expandDecimals(10, 18));
    expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(0);
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(
      "9995000625000000000" // 9.995000625
    );
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(0);
    expect(await getSwapImpactPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(
      "4999375000000000" // 0.004999375 ETH, 24.996875 USD
    );

    // increase positive and negative price impact to 0.2% for every $100,000 of token imbalance
    // 0.2% => 0.002
    // 0.002 / 100,000 => 2 * (10 ** -8)
    await dataStore.setUint(keys.swapImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(2, 8));
    await dataStore.setUint(keys.swapImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(2, 8));
    await dataStore.setUint(keys.swapImpactExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        shortTokenAmount: expandDecimals(50000, 6),
        receiver: user2,
      },
      execute: {
        gasUsageLabel: "executeDeposit",
      },
    });

    expect(await getMarketTokenPrice(fixture)).eq(expandDecimals(1, 30));

    expect(await getBalanceOf(ethUsdMarket.marketToken, user2.address)).eq("50024996875000000000000"); // 50024.996875

    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(expandDecimals(10, 18));
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(50 * 1000, 6));
    expect(await getSwapImpactPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(0);
  });

  it("!isSameSideRebalance, net negative price impact", async () => {
    // set negative price impact to 0.1% for every $100,000 of token imbalance
    // 0.1% => 0.001
    // 0.001 / 100,000 => 1 * (10 ** -8)
    // set positive price impact to 0.05% for every $100,000 of token imbalance
    // 0.05% => 0.0005
    // 0.0005 / 100,000 => 5 * (10 ** -9)
    await dataStore.setUint(keys.swapImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(1, 8));
    await dataStore.setUint(keys.swapImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(5, 9));
    await dataStore.setUint(keys.swapImpactExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(10, 18),
      },
      execute: {
        gasUsageLabel: "executeDeposit",
      },
    });

    expect(await getMarketTokenPrice(fixture)).eq(expandDecimals(1, 30));

    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq("49975000000000000000000");
    expect(await wnt.balanceOf(depositVault.address)).eq(0);
    expect(await usdc.balanceOf(depositVault.address)).eq(0);

    expect(await wnt.balanceOf(ethUsdMarket.marketToken)).eq(expandDecimals(10, 18));
    expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(0);
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq("9995000000000000000");
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(0);
    expect(await getSwapImpactPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(
      "5000000000000000" // 0.005 ETH, 25 USD
    );

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        shortTokenAmount: expandDecimals(100 * 1000, 6),
        receiver: user1,
      },
      execute: {
        gasUsageLabel: "executeDeposit",
      },
    });

    expect(await getMarketTokenPrice(fixture)).eq(expandDecimals(1, 30));
    expect(await getBalanceOf(ethUsdMarket.marketToken, user1.address)).eq("99987462496000000000000"); // 99987.462496

    expect(await wnt.balanceOf(ethUsdMarket.marketToken)).eq(expandDecimals(10, 18));
    expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(expandDecimals(100 * 1000, 6));
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq("9995000000000000000");
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq("99987462496"); // 99987.462496
    expect(await getSwapImpactPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(
      "5000000000000000" // 0.005 ETH, 25 USD
    );
    // 12.5 USD positive price impact, 25 USD negative price impact
    // net ~12.5 USD negative price impact
    expect(await getSwapImpactPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(
      "12537504" // 12.537504
    );
  });

  it("!isSameSideRebalance, net positive price impact", async () => {
    // set negative price impact to 0.1% for every $100,000 of token imbalance
    // 0.1% => 0.001
    // 0.001 / 100,000 => 1 * (10 ** -8)
    // set positive price impact to 0.05% for every $100,000 of token imbalance
    // 0.05% => 0.0005
    // 0.0005 / 100,000 => 5 * (10 ** -9)
    await dataStore.setUint(keys.swapImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(1, 8));
    await dataStore.setUint(keys.swapImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(5, 9));
    await dataStore.setUint(keys.swapImpactExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(10, 18),
      },
      execute: {
        gasUsageLabel: "executeDeposit",
      },
    });

    expect(await getMarketTokenPrice(fixture)).eq(expandDecimals(1, 30));

    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq("49975000000000000000000");
    expect(await wnt.balanceOf(depositVault.address)).eq(0);
    expect(await usdc.balanceOf(depositVault.address)).eq(0);

    expect(await wnt.balanceOf(ethUsdMarket.marketToken)).eq(expandDecimals(10, 18));
    expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(0);
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq("9995000000000000000");
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(0);
    expect(await getSwapImpactPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(
      "5000000000000000" // 0.005 ETH, 25 USD
    );

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        shortTokenAmount: expandDecimals(60 * 1000, 6),
        receiver: user1,
      },
      execute: {
        gasUsageLabel: "executeDeposit",
      },
    });

    expect(await getMarketTokenPrice(fixture)).eq(expandDecimals(1, 30));
    expect(await getBalanceOf(ethUsdMarket.marketToken, user1.address)).eq("60011484797797146090000"); // 60011.48479779714609

    expect(await wnt.balanceOf(ethUsdMarket.marketToken)).eq(expandDecimals(10, 18));
    expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(expandDecimals(60 * 1000, 6));
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(
      "9997296959559429218" // 9.997296959559429218
    );
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq("60000000000"); // 60,000
    expect(await getSwapImpactPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(
      "2703040440570782" // 0.002703040440570782 ETH, ~13.51 USD
    );
    expect(await getSwapImpactPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(0);
  });

  it("price impact, fees", async () => {
    // 0.05%: 0.0005
    await dataStore.setUint(keys.depositFeeFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(5, 4));
    await dataStore.setUint(keys.depositFeeFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(5, 4));
    // 30%
    await dataStore.setUint(keys.SWAP_FEE_RECEIVER_FACTOR, decimalToFloat(3, 1));

    // set negative price impact to 0.1% for every $100,000 of token imbalance
    // 0.1% => 0.001
    // 0.001 / 100,000 => 1 * (10 ** -8)
    // set positive price impact to 0.05% for every $100,000 of token imbalance
    // 0.05% => 0.0005
    // 0.0005 / 100,000 => 5 * (10 ** -9)
    await dataStore.setUint(keys.swapImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(1, 8));
    await dataStore.setUint(keys.swapImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(5, 9));
    await dataStore.setUint(keys.swapImpactExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(10, 18),
      },
      execute: {
        gasUsageLabel: "executeDeposit",
      },
    });

    expect(await getMarketTokenPrice(fixture)).eq("1000350350350350350350350350350"); // 1.00035035035

    expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq("49950000000000000000000"); // 49950
    expect(await wnt.balanceOf(depositVault.address)).eq(0);
    expect(await usdc.balanceOf(depositVault.address)).eq(0);
    expect(await getClaimableFeeAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq("1500000000000000"); // 0.0015 ETH, 7.5 USD
    expect(await getClaimableFeeAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq("0");

    expect(await wnt.balanceOf(ethUsdMarket.marketToken)).eq("10000000000000000000"); // 10 ETH
    expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(0);
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(
      "9993500000000000000" // 9.9935 ETH
    );
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(0);
    expect(await getSwapImpactPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(
      "5000000000000000" // 0.005 ETH, 25 USD
    );

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        shortTokenAmount: expandDecimals(49975, 6),
        receiver: user1,
      },
      execute: {
        gasUsageLabel: "executeDeposit",
      },
    });

    expect(await getMarketTokenPrice(fixture)).eq("1000525446705011352181369795225"); // ~1.00052

    expect(await getBalanceOf(ethUsdMarket.marketToken, user1.address)).eq("49944998007606848330474"); // 49944.998
    expect(await wnt.balanceOf(ethUsdMarket.marketToken)).eq("10000000000000000000"); // 10 ETH
    expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq("49975000000"); // 49975 USDC
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(
      "9995996751031412188" // 9.996 ETH
    );
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq("49967503750"); // 49967.50375 USDC
    expect(await getSwapImpactPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(
      "2503248968587812" // 0.0025, 12.5 USD
    );
  });

  it("one-sided deposit, positive price impact accounts for the rebate added to the pool", async () => {
    // set negative price impact to 0.1% for every $100,000 of token imbalance => 1e-8
    // set positive price impact to 0.05% for every $100,000 of token imbalance => 5e-9
    await dataStore.setUint(keys.swapImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(1, 8));
    await dataStore.setUint(keys.swapImpactFactorKey(ethUsdMarket.marketToken, true), decimalToFloat(5, 9));
    await dataStore.setUint(keys.swapImpactExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));

    // deposit USDC only to create a short-heavy pool and seed the USDC swap impact pool
    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        shortTokenAmount: expandDecimals(50 * 1000, 6),
      },
      execute: {
        gasUsageLabel: "executeDeposit",
      },
    });

    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq("49975000000"); // 49975 USDC
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(0);
    const usdcImpactPoolBefore = await getSwapImpactPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address);
    expect(usdcImpactPoolBefore).eq("25000000"); // 25 USDC, $25
    expect(await getMarketTokenPrice(fixture)).eq(expandDecimals(1, 30));

    // deposit WNT into the short-heavy pool: the positive-impact rebate is paid in USDC and added
    // back to the overweight short side, so the credited impact reflects the post-rebate balance
    // (~$9.3664) rather than the deposit-only quote (~$9.36875)
    const depositAmountOut = await reader.getDepositAmountOut(
      dataStore.address,
      ethUsdMarket,
      prices.ethUsdMarket,
      expandDecimals(5, 18),
      0,
      AddressZero,
      SwapPricingType.TwoStep,
      true
    );

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(5, 18),
        receiver: user1,
      },
      execute: {
        gasUsageLabel: "executeDeposit",
      },
    });

    expect(await getBalanceOf(ethUsdMarket.marketToken, user1.address)).eq("25009366409000000000000"); // 25009.366409
    expect(depositAmountOut).eq(await getBalanceOf(ethUsdMarket.marketToken, user1.address));
    const usdcImpactPoolAfter = await getSwapImpactPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address);
    expect(usdcImpactPoolAfter).lt(usdcImpactPoolBefore); // rebate paid in USDC
    expect(usdcImpactPoolAfter).eq("15633591"); // 15.633591 USDC, 9.366409 USDC rebate paid
    expect(await getMarketTokenPrice(fixture)).eq(expandDecimals(1, 30)); // no over-mint
  });

  it("handle deposit error", async () => {
    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        shortTokenAmount: expandDecimals(50 * 1000, 6),
        receiver: user1,
        minMarketTokens: expandDecimals(51 * 1000, 18),
      },
      execute: {
        gasUsageLabel: "executeDeposit",
        expectedCancellationReason: "MinMarketTokens",
      },
    });

    expect(await getSupplyOf(ethUsdMarket.marketToken)).eq(0);
  });

  it("single token market", async () => {
    await handleDeposit(fixture, {
      create: {
        market: ethUsdSingleTokenMarket,
        shortTokenAmount: expandDecimals(20 * 1000, 6),
      },
      execute: {
        gasUsageLabel: "executeDeposit",
      },
    });
    expect(await getSupplyOf(ethUsdSingleTokenMarket.marketToken)).eq(expandDecimals(20 * 1000, 18));

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, {
        market: ethUsdSingleTokenMarket,
        prices: {
          longTokenPrice: {
            min: expandDecimals(1, 6 + 18),
            max: expandDecimals(1, 6 + 18),
          },
        },
      }),
      async ([marketTokenPrice, poolValueInfo]) => {
        expect(marketTokenPrice).eq(expandDecimals(1, 30));
        expect(poolValueInfo.poolValue).eq(expandDecimals(20 * 1000, 30));
      }
    );

    await handleDeposit(fixture, {
      create: {
        market: ethUsdSingleTokenMarket,
        longTokenAmount: expandDecimals(30 * 1000, 6),
      },
      execute: {
        gasUsageLabel: "executeDeposit",
      },
    });
    expect(await getSupplyOf(ethUsdSingleTokenMarket.marketToken)).eq(expandDecimals(50 * 1000, 18));

    await usingResult(
      getMarketTokenPriceWithPoolValue(fixture, {
        market: ethUsdSingleTokenMarket,
        prices: {
          longTokenPrice: {
            min: expandDecimals(1, 6 + 18),
            max: expandDecimals(1, 6 + 18),
          },
        },
      }),
      async ([marketTokenPrice, poolValueInfo]) => {
        expect(marketTokenPrice).eq(expandDecimals(1, 30));
        expect(poolValueInfo.poolValue).eq(expandDecimals(50 * 1000, 30));
      }
    );
  });
});
