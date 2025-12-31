import { expect } from "chai";
import { impersonateAccount, setBalance } from "@nomicfoundation/hardhat-network-helpers";

import { contractAt, deployContract } from "../../utils/deploy";
import { createDeposit, getDepositKeys, handleDeposit } from "../../utils/deposit";
import { createOrder, executeOrder, handleOrder, DecreasePositionSwapType, OrderType } from "../../utils/order";
import { createShift, getShiftKeys } from "../../utils/shift";
import { createWithdrawal, getWithdrawalKeys } from "../../utils/withdrawal";
import { decimalToFloat, expandDecimals, bigNumberify } from "../../utils/math";
import { increaseTime } from "../../utils/time";
import { parseError } from "../../utils/error";
import { grantRole } from "../../utils/role";
import { hashString } from "../../utils/hash";
import { executeLiquidation } from "../../utils/liquidation";
import { executeAdl, updateAdlState } from "../../utils/adl";
import { getTokenPermit } from "../../utils/relay/tokenPermit";
import { GELATO_RELAY_ADDRESS } from "../../utils/relay/addresses";
import { getRelayParams, sendRelayTransaction } from "../../utils/relay/helpers";
import { getUpdateOrderSignature } from "../../utils/relay/signatures";
import {
  sendBatch as sendGelatoBatch,
  sendCancelOrder as sendGelatoCancelOrder,
  sendCreateOrder as sendGelatoCreateOrder,
} from "../../utils/relay/gelatoRelay";
import {
  sendBridgeOut as sendMultichainBridgeOut,
  sendCreateOrder as sendMultichainCreateOrder,
  sendClaimAffiliateRewards,
  sendClaimCollateral,
  sendClaimFundingFees,
} from "../../utils/relay/multichain";
import { bridgeInTokens } from "../../utils/multichain";
import { TOKEN_ORACLE_TYPES } from "../../utils/oracle";
import * as keys from "../../utils/keys";

export type ReentrancyCaseContext = {
  fixture: any;
  user0: any;
  dataStore: any;
  exchangeRouter: any;
  orderHandler: any;
  ethUsdMarket: any;
  wnt: any;
  executionFee: any;
};

const FALLBACK_CALLDATA = "0xdeadbeef";

async function getCallbackGasLimit(dataStore) {
  const maxCallbackGasLimit = await dataStore.getUint(keys.MAX_CALLBACK_GAS_LIMIT);
  if (maxCallbackGasLimit.eq(0)) {
    throw new Error("MAX_CALLBACK_GAS_LIMIT is not configured");
  }

  const fallback = bigNumberify(1_000_000);
  return maxCallbackGasLimit.lt(fallback) ? maxCallbackGasLimit : fallback;
}

async function increaseTimeForCancellation(dataStore) {
  const expiration = await dataStore.getUint(keys.REQUEST_EXPIRATION_TIME);
  const refTime = (await ethers.provider.getBlock()).timestamp;
  const waitSeconds = expiration.toNumber() + 1;
  await increaseTime(refTime, waitSeconds);
}

async function expectReentrancyGuard(reentrancyTest) {
  expect(await reentrancyTest.reenterDepth()).eq(1);
  expect(await reentrancyTest.lastReenterSuccess()).eq(false);

  const lastResult = await reentrancyTest.lastReenterResult();
  const parsed = parseError(lastResult, false);
  expect(parsed?.name).eq("Error");
  expect(parsed?.args?.[0]).eq("ReentrancyGuard: reentrant call");
}

async function expectReentrancyBlocked(reentrancyTest) {
  expect(await reentrancyTest.reenterDepth()).eq(1);
  expect(await reentrancyTest.lastReenterSuccess()).eq(false);
}

async function expectTokenReentrancyGuard(reentrantToken) {
  expect(await reentrantToken.reenterDepth()).eq(1);
  expect(await reentrantToken.lastReenterSuccess()).eq(false);

  const lastResult = await reentrantToken.lastReenterResult();
  const parsed = parseError(lastResult, false);
  expect(parsed?.name).eq("Error");
  expect(parsed?.args?.[0]).eq("ReentrancyGuard: reentrant call");
}

async function expectTokenReentrancyBlocked(reentrantToken) {
  expect(await reentrantToken.reenterDepth()).eq(1);
  expect(await reentrantToken.lastReenterSuccess()).eq(false);
}

async function getRelaySignerAndChainId() {
  await impersonateAccount(GELATO_RELAY_ADDRESS);
  await setBalance(GELATO_RELAY_ADDRESS, expandDecimals(100, 18));
  const relaySigner = await ethers.getSigner(GELATO_RELAY_ADDRESS);
  const chainId = await ethers.provider.getNetwork().then((network) => network.chainId);
  return { relaySigner, chainId };
}

function getEmptyRelayParams(chainId) {
  return {
    oracleParams: { tokens: [], providers: [], data: [] },
    externalCalls: {
      sendTokens: [],
      sendAmounts: [],
      externalCallTargets: [],
      externalCallDataList: [],
      refundTokens: [],
      refundReceivers: [],
    },
    tokenPermits: [],
    fee: { feeToken: ethers.constants.AddressZero, feeAmount: 0, feeSwapPath: [] },
    userNonce: 0,
    deadline: 0,
    signature: "0x",
    desChainId: chainId,
  };
}

function getRelayReentrancyCalls(reentrancyTest, feeToken, amount) {
  return {
    sendTokens: [feeToken],
    sendAmounts: [amount],
    externalCallTargets: [reentrancyTest.address],
    externalCallDataList: [FALLBACK_CALLDATA],
    refundTokens: [],
    refundReceivers: [],
  };
}

function getDefaultRelayOrderParams(ctx, overrides: Partial<any> = {}) {
  const { user0, user1, user2 } = ctx.fixture.accounts;
  const { ethUsdMarket } = ctx.fixture.contracts;
  const referralCode = hashString("referralCode");

  return {
    addresses: {
      receiver: user0.address,
      cancellationReceiver: user0.address,
      callbackContract: user1.address,
      uiFeeReceiver: user2.address,
      market: ethUsdMarket.marketToken,
      initialCollateralToken: ethUsdMarket.longToken,
      swapPath: [ethUsdMarket.marketToken],
    },
    numbers: {
      sizeDeltaUsd: decimalToFloat(1000),
      initialCollateralDeltaAmount: expandDecimals(1, 17),
      triggerPrice: decimalToFloat(4800),
      acceptablePrice: decimalToFloat(4900),
      executionFee: expandDecimals(1, 15),
      callbackGasLimit: "200000",
      minOutputAmount: 700,
      validFromTime: 0,
    },
    orderType: OrderType.LimitIncrease,
    decreasePositionSwapType: DecreasePositionSwapType.SwapCollateralTokenToPnlToken,
    isLong: true,
    shouldUnwrapNativeToken: true,
    autoCancel: false,
    referralCode,
    dataList: [],
    ...overrides,
  };
}

function getEmptyGlvDepositParams() {
  return {
    addresses: {
      glv: ethers.constants.AddressZero,
      market: ethers.constants.AddressZero,
      receiver: ethers.constants.AddressZero,
      callbackContract: ethers.constants.AddressZero,
      uiFeeReceiver: ethers.constants.AddressZero,
      initialLongToken: ethers.constants.AddressZero,
      initialShortToken: ethers.constants.AddressZero,
      longTokenSwapPath: [],
      shortTokenSwapPath: [],
    },
    minGlvTokens: 0,
    executionFee: 0,
    callbackGasLimit: 0,
    shouldUnwrapNativeToken: false,
    isMarketTokenDeposit: false,
    dataList: [],
  };
}

async function deployReentrantToken() {
  return deployContract("ReentrantToken", ["ReentrantToken", "RNT", 18]);
}

async function createOrderForCallback(ctx, callbackContract) {
  const callbackGasLimit = await getCallbackGasLimit(ctx.dataStore);
  await handleDeposit(ctx.fixture, {
    create: {
      market: ctx.ethUsdMarket,
      longTokenAmount: expandDecimals(1000, 18),
      shortTokenAmount: expandDecimals(1000 * 1000, 6),
    },
  });

  const { key } = await createOrder(ctx.fixture, {
    market: ctx.ethUsdMarket,
    callbackContract,
    callbackGasLimit,
    initialCollateralToken: ctx.wnt,
    initialCollateralDeltaAmount: expandDecimals(10, 18),
    swapPath: [],
    sizeDeltaUsd: decimalToFloat(200 * 1000),
    acceptablePrice: expandDecimals(5001, 12),
    executionFee: ctx.executionFee,
    minOutputAmount: expandDecimals(50_000, 6),
    orderType: OrderType.MarketIncrease,
    isLong: true,
    shouldUnwrapNativeToken: false,
  });

  return key;
}

async function setupMultichainRelay(ctx, account, amount = expandDecimals(1, 18)) {
  const { dataStore, mockStargatePoolNative, mockStargatePoolUsdc, wnt } = ctx.fixture.contracts;
  const { relaySigner, chainId } = await getRelaySignerAndChainId();

  await dataStore.setBool(keys.isSrcChainIdEnabledKey(chainId), true);
  await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolNative.address), true);
  await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolUsdc.address), true);
  await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolNative.address), true);
  await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolUsdc.address), true);
  await dataStore.setUint(keys.tokenTransferGasLimit(wnt.address), 2_000_000);

  const amountValue = bigNumberify(amount);
  if (amountValue.gt(0)) {
    await bridgeInTokens(ctx.fixture, { account, amount: amountValue });
  }

  return { relaySigner, chainId };
}

export const REENTRANCY_CASES: Record<string, (ctx: ReentrancyCaseContext) => Promise<void>> = {
  "AdlHandler.executeAdl -> AdlHandler.updateAdlState": async (ctx) => {
    const { wallet } = ctx.fixture.accounts;
    const { roleStore, dataStore, adlHandler, solUsdMarket, wnt, usdc } = ctx.fixture.contracts;
    const reentrancyTest = await deployContract("ReentrancyTest", []);

    await handleDeposit(ctx.fixture, {
      create: {
        market: solUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
      },
      execute: {
        tokens: [solUsdMarket.indexToken, wnt.address, usdc.address],
        precisions: [8, 8, 18],
        minPrices: [expandDecimals(20, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(20, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
      },
    });

    await handleOrder(ctx.fixture, {
      create: {
        account: reentrancyTest,
        receiver: reentrancyTest,
        market: solUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(100, 18),
        sizeDeltaUsd: decimalToFloat(2000 * 1000),
        acceptablePrice: expandDecimals(5001, 12),
        orderType: OrderType.MarketIncrease,
        isLong: true,
      },
      execute: {
        tokens: [solUsdMarket.indexToken, wnt.address, usdc.address],
        precisions: [8, 8, 18],
        minPrices: [expandDecimals(20, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(20, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
      },
    });

    const maxPnlFactorKey = keys.maxPnlFactorKey(keys.MAX_PNL_FACTOR, solUsdMarket.marketToken, true);
    const maxPnlFactorForAdlKey = keys.maxPnlFactorKey(keys.MAX_PNL_FACTOR_FOR_ADL, solUsdMarket.marketToken, true);
    const minPnlFactorAfterAdlKey = keys.minPnlFactorAfterAdl(solUsdMarket.marketToken, true);

    await dataStore.setUint(maxPnlFactorKey, decimalToFloat(10, 2));
    await dataStore.setUint(maxPnlFactorForAdlKey, decimalToFloat(10, 2));
    await dataStore.setUint(minPnlFactorAfterAdlKey, decimalToFloat(2, 2));
    await grantRole(roleStore, wallet.address, "ADL_KEEPER");
    await dataStore.setUint(keys.NATIVE_TOKEN_TRANSFER_GAS_LIMIT, bigNumberify(2_000_000));

    await updateAdlState(ctx.fixture, {
      market: solUsdMarket,
      isLong: true,
      tokens: [solUsdMarket.indexToken, wnt.address, usdc.address],
      precisions: [8, 8, 18],
      minPrices: [expandDecimals(26, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
      maxPrices: [expandDecimals(26, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
      tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
    });

    const oracleParams = { tokens: [], providers: [], data: [] };
    const reenterCalldata = adlHandler.interface.encodeFunctionData("updateAdlState", [
      solUsdMarket.marketToken,
      true,
      oracleParams,
    ]);
    await reentrancyTest.setReenterConfig(adlHandler.address, reenterCalldata, 0, 1, false);

    await executeAdl(ctx.fixture, {
      account: reentrancyTest.address,
      market: solUsdMarket,
      collateralToken: wnt,
      isLong: true,
      sizeDeltaUsd: decimalToFloat(100 * 1000),
      tokens: [solUsdMarket.indexToken, wnt.address, usdc.address],
      precisions: [8, 8, 18],
      minPrices: [expandDecimals(26, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
      maxPrices: [expandDecimals(26, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
      tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
    });

    await expectReentrancyGuard(reentrancyTest);
  },
  "AdlHandler.updateAdlState -> AdlHandler.executeAdl": async (ctx) => {
    const { wallet } = ctx.fixture.accounts;
    const { roleStore, dataStore, oracle, adlHandler, solUsdMarket, wnt, usdc } = ctx.fixture.contracts;
    const reentrancyProvider = await deployContract("ReentrantOracleProvider", []);

    await grantRole(roleStore, wallet.address, "ADL_KEEPER");
    await dataStore.setBool(keys.isOracleProviderEnabledKey(reentrancyProvider.address), true);
    await dataStore.setAddress(
      keys.oracleProviderForTokenKey(oracle.address, solUsdMarket.indexToken),
      reentrancyProvider.address
    );
    await dataStore.setAddress(keys.oracleProviderForTokenKey(oracle.address, wnt.address), reentrancyProvider.address);
    await dataStore.setAddress(
      keys.oracleProviderForTokenKey(oracle.address, usdc.address),
      reentrancyProvider.address
    );

    const emptyOracleParams = { tokens: [], providers: [], data: [] };
    const reenterCalldata = adlHandler.interface.encodeFunctionData("executeAdl", [
      wallet.address,
      solUsdMarket.marketToken,
      wnt.address,
      true,
      decimalToFloat(1),
      emptyOracleParams,
    ]);
    await reentrancyProvider.setReenterConfig(adlHandler.address, reenterCalldata, 0, 1, false);

    await adlHandler.connect(wallet).updateAdlState(solUsdMarket.marketToken, true, {
      tokens: [solUsdMarket.indexToken, wnt.address, usdc.address],
      providers: [reentrancyProvider.address, reentrancyProvider.address, reentrancyProvider.address],
      data: ["0x", "0x", "0x"],
    });

    await expectReentrancyGuard(reentrancyProvider);
  },
  "ClaimHandler.acceptTermsAndClaim -> ClaimHandler.transferClaim": async (ctx) => {
    const { wallet, user0, user1 } = ctx.fixture.accounts;
    const { dataStore, claimHandler, claimVault } = ctx.fixture.contracts;
    const reentrancyToken = await deployReentrantToken();

    const distributionId = 1;
    const claimableAmount = expandDecimals(1, 18);

    await dataStore.setAddress(keys.HOLDING_ADDRESS, wallet.address);
    await dataStore.setUint(keys.tokenTransferGasLimit(reentrancyToken.address), 2_000_000);
    await dataStore.setUint(
      keys.claimableFundsAmountKey(user0.address, reentrancyToken.address, distributionId),
      claimableAmount
    );
    await dataStore.setUint(keys.totalClaimableFundsAmountKey(reentrancyToken.address), claimableAmount);
    await reentrancyToken.mint(claimVault.address, claimableAmount);

    const reenterCalldata = claimHandler.interface.encodeFunctionData("transferClaim", [
      reentrancyToken.address,
      [{ token: reentrancyToken.address, distributionId, fromAccount: user0.address, toAccount: user1.address }],
    ]);
    await reentrancyToken.setReenterConfig(claimHandler.address, reenterCalldata, 0, 1, false);

    await claimHandler.connect(user0).acceptTermsAndClaim(
      [
        {
          token: reentrancyToken.address,
          distributionId,
          termsSignature: "0x",
          acceptedTerms: "",
        },
      ],
      user0.address
    );

    await expectTokenReentrancyGuard(reentrancyToken);
  },
  "ExchangeRouter.sendNativeToken -> ExchangeRouter.cancelOrder": async (ctx) => {
    const reentrancyTest = await deployContract("ReentrancyTest", []);
    const reenterCalldata = ctx.exchangeRouter.interface.encodeFunctionData("cancelOrder", [ethers.constants.HashZero]);
    await reentrancyTest.setReenterConfig(ctx.exchangeRouter.address, reenterCalldata, 0, 1, false);

    await ctx.dataStore.setUint(keys.NATIVE_TOKEN_TRANSFER_GAS_LIMIT, bigNumberify(2_000_000));

    const amount = expandDecimals(1, 15);
    await ctx.exchangeRouter.connect(ctx.user0).sendNativeToken(reentrancyTest.address, amount, { value: amount });

    await expectReentrancyGuard(reentrancyTest);
  },
  "FeeHandler.claimFees -> FeeHandler.withdrawFees": async (ctx) => {
    const { user0, wallet } = ctx.fixture.accounts;
    const { dataStore, feeHandler } = ctx.fixture.contracts;
    const reentrancyToken = await deployReentrantToken();

    const feeAmount = expandDecimals(1, 18);

    await dataStore.setAddress(keys.FEE_RECEIVER, wallet.address);
    await dataStore.setUint(keys.buybackBatchAmountKey(reentrancyToken.address), 1);
    await dataStore.setUint(keys.tokenTransferGasLimit(reentrancyToken.address), 2_000_000);
    await dataStore.setUint(
      keys.claimableFeeAmountKey(ctx.ethUsdMarket.marketToken, reentrancyToken.address),
      feeAmount
    );
    await reentrancyToken.mint(ctx.ethUsdMarket.marketToken, feeAmount);

    const reenterCalldata = feeHandler.interface.encodeFunctionData("withdrawFees", [reentrancyToken.address]);
    await reentrancyToken.setReenterConfig(feeHandler.address, reenterCalldata, 0, 1, false);

    await feeHandler.connect(user0).claimFees(ctx.ethUsdMarket.marketToken, reentrancyToken.address, 2);

    await expectTokenReentrancyGuard(reentrancyToken);
  },
  "FeeHandler.withdrawFees -> FeeHandler.claimFees": async (ctx) => {
    const { wallet } = ctx.fixture.accounts;
    const { roleStore, dataStore, feeHandler } = ctx.fixture.contracts;
    const reentrancyToken = await deployReentrantToken();

    const feeAmount = expandDecimals(1, 18);

    await grantRole(roleStore, wallet.address, "FEE_KEEPER");
    await dataStore.setAddress(keys.FEE_RECEIVER, wallet.address);
    await dataStore.setUint(keys.buybackBatchAmountKey(reentrancyToken.address), 1);
    await dataStore.setUint(keys.withdrawableBuybackTokenAmountKey(reentrancyToken.address), feeAmount);
    await reentrancyToken.mint(feeHandler.address, feeAmount);

    const reenterCalldata = feeHandler.interface.encodeFunctionData("claimFees", [
      ctx.ethUsdMarket.marketToken,
      reentrancyToken.address,
      2,
    ]);
    await reentrancyToken.setReenterConfig(feeHandler.address, reenterCalldata, 0, 1, false);

    await feeHandler.connect(wallet).withdrawFees(reentrancyToken.address);

    await expectTokenReentrancyGuard(reentrancyToken);
  },
  "GelatoRelayRouter.batch -> GelatoRelayRouter.updateOrder": async (ctx) => {
    const { user0 } = ctx.fixture.accounts;
    const { dataStore, gelatoRelayRouter, router, wnt } = ctx.fixture.contracts;
    const reentrancyTest = await deployContract("ReentrancyTest", []);
    const { relaySigner, chainId } = await getRelaySignerAndChainId();

    await dataStore.setBool(keys.isSrcChainIdEnabledKey(chainId), true);
    await wnt.connect(user0).deposit({ value: expandDecimals(1, 18) });

    const tokenPermit = await getTokenPermit(wnt, user0, router.address, expandDecimals(1, 18), 0, 9999999999, chainId);

    const params = getDefaultRelayOrderParams(ctx);
    const externalCalls = getRelayReentrancyCalls(reentrancyTest, wnt.address, expandDecimals(1, 15));

    const batchParams: any = {
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: wnt.address,
        feeAmount: expandDecimals(2, 15),
        feeSwapPath: [],
      },
      tokenPermits: [tokenPermit],
      account: user0.address,
      userNonce: 1,
      createOrderParamsList: [params],
      updateOrderParamsList: [],
      cancelOrderKeys: [],
      deadline: 9999999999,
      relayRouter: gelatoRelayRouter,
      chainId,
      desChainId: chainId,
      gelatoRelayFeeToken: wnt.address,
      gelatoRelayFeeAmount: expandDecimals(1, 15),
      externalCalls,
    };

    const emptyRelayParams = getEmptyRelayParams(chainId);
    const reenterCalldata = gelatoRelayRouter.interface.encodeFunctionData("updateOrder", [
      emptyRelayParams,
      user0.address,
      {
        key: ethers.constants.HashZero,
        sizeDeltaUsd: 0,
        acceptablePrice: 0,
        triggerPrice: 0,
        minOutputAmount: 0,
        validFromTime: 0,
        autoCancel: false,
        executionFeeIncrease: 0,
      },
    ]);
    await reentrancyTest.setReenterConfig(gelatoRelayRouter.address, reenterCalldata, 0, 1, false);

    await sendGelatoBatch(batchParams);

    await expectReentrancyGuard(reentrancyTest);
  },
  "GelatoRelayRouter.cancelOrder -> GelatoRelayRouter.updateOrder": async (ctx) => {
    const { user0 } = ctx.fixture.accounts;
    const { dataStore, gelatoRelayRouter, router, wnt } = ctx.fixture.contracts;
    const reentrancyTest = await deployContract("ReentrancyTest", []);
    const { relaySigner, chainId } = await getRelaySignerAndChainId();

    await dataStore.setBool(keys.isSrcChainIdEnabledKey(chainId), true);
    await wnt.connect(user0).deposit({ value: expandDecimals(1, 18) });

    const tokenPermit = await getTokenPermit(wnt, user0, router.address, expandDecimals(1, 18), 0, 9999999999, chainId);

    const { key } = await createOrder(ctx.fixture, {
      account: user0,
      market: ctx.ethUsdMarket,
      initialCollateralToken: ctx.wnt,
      initialCollateralDeltaAmount: expandDecimals(10, 18),
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200 * 1000),
      acceptablePrice: expandDecimals(5001, 12),
      executionFee: ctx.executionFee,
      minOutputAmount: expandDecimals(50_000, 6),
      orderType: OrderType.MarketIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    });

    const externalCalls = getRelayReentrancyCalls(reentrancyTest, wnt.address, expandDecimals(1, 15));

    const emptyRelayParams = getEmptyRelayParams(chainId);
    const reenterCalldata = gelatoRelayRouter.interface.encodeFunctionData("updateOrder", [
      emptyRelayParams,
      user0.address,
      {
        key: ethers.constants.HashZero,
        sizeDeltaUsd: 0,
        acceptablePrice: 0,
        triggerPrice: 0,
        minOutputAmount: 0,
        validFromTime: 0,
        autoCancel: false,
        executionFeeIncrease: 0,
      },
    ]);
    await reentrancyTest.setReenterConfig(gelatoRelayRouter.address, reenterCalldata, 0, 1, false);

    await increaseTimeForCancellation(ctx.dataStore);

    await sendGelatoCancelOrder({
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: wnt.address,
        feeAmount: expandDecimals(2, 15),
        feeSwapPath: [],
      },
      tokenPermits: [tokenPermit],
      account: user0.address,
      key,
      deadline: 9999999999,
      desChainId: chainId,
      relayRouter: gelatoRelayRouter,
      chainId,
      gelatoRelayFeeToken: wnt.address,
      gelatoRelayFeeAmount: expandDecimals(1, 15),
      externalCalls,
    });

    await expectReentrancyGuard(reentrancyTest);
  },
  "GelatoRelayRouter.createOrder -> GelatoRelayRouter.cancelOrder": async (ctx) => {
    const { user0 } = ctx.fixture.accounts;
    const { dataStore, gelatoRelayRouter, router, wnt } = ctx.fixture.contracts;
    const reentrancyTest = await deployContract("ReentrancyTest", []);
    const { relaySigner, chainId } = await getRelaySignerAndChainId();

    await dataStore.setBool(keys.isSrcChainIdEnabledKey(chainId), true);
    await wnt.connect(user0).deposit({ value: expandDecimals(1, 18) });

    const tokenPermit = await getTokenPermit(wnt, user0, router.address, expandDecimals(1, 18), 0, 9999999999, chainId);

    const params = getDefaultRelayOrderParams(ctx);
    const externalCalls = getRelayReentrancyCalls(reentrancyTest, wnt.address, expandDecimals(1, 15));

    const createOrderParams = {
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: wnt.address,
        feeAmount: expandDecimals(2, 15),
        feeSwapPath: [],
      },
      tokenPermits: [tokenPermit],
      account: user0.address,
      params,
      deadline: 9999999999,
      desChainId: chainId,
      relayRouter: gelatoRelayRouter,
      chainId,
      gelatoRelayFeeToken: wnt.address,
      gelatoRelayFeeAmount: expandDecimals(1, 15),
      externalCalls,
    };

    const emptyRelayParams = getEmptyRelayParams(chainId);
    const reenterCalldata = gelatoRelayRouter.interface.encodeFunctionData("cancelOrder", [
      emptyRelayParams,
      user0.address,
      ethers.constants.HashZero,
    ]);
    await reentrancyTest.setReenterConfig(gelatoRelayRouter.address, reenterCalldata, 0, 1, false);

    await sendGelatoCreateOrder(createOrderParams);

    await expectReentrancyGuard(reentrancyTest);
  },
  "GelatoRelayRouter.sendNativeToken -> GelatoRelayRouter.cancelOrder": async (ctx) => {
    const { user0 } = ctx.fixture.accounts;
    const { dataStore, gelatoRelayRouter } = ctx.fixture.contracts;
    const reentrancyTest = await deployContract("ReentrancyTest", []);
    const chainId = await ethers.provider.getNetwork().then((network) => network.chainId);

    const emptyRelayParams = getEmptyRelayParams(chainId);
    const reenterCalldata = gelatoRelayRouter.interface.encodeFunctionData("cancelOrder", [
      emptyRelayParams,
      user0.address,
      ethers.constants.HashZero,
    ]);
    await reentrancyTest.setReenterConfig(gelatoRelayRouter.address, reenterCalldata, 0, 1, false);

    await dataStore.setUint(keys.NATIVE_TOKEN_TRANSFER_GAS_LIMIT, bigNumberify(2_000_000));

    const amount = expandDecimals(1, 15);
    await gelatoRelayRouter.connect(user0).sendNativeToken(reentrancyTest.address, amount, { value: amount });

    await expectReentrancyGuard(reentrancyTest);
  },
  "GelatoRelayRouter.updateOrder -> GelatoRelayRouter.cancelOrder": async (ctx) => {
    const { user0 } = ctx.fixture.accounts;
    const { dataStore, gelatoRelayRouter, router, wnt } = ctx.fixture.contracts;
    const reentrancyTest = await deployContract("ReentrancyTest", []);
    const { relaySigner, chainId } = await getRelaySignerAndChainId();

    await dataStore.setBool(keys.isSrcChainIdEnabledKey(chainId), true);
    await wnt.connect(user0).deposit({ value: expandDecimals(1, 18) });

    const tokenPermit = await getTokenPermit(wnt, user0, router.address, expandDecimals(1, 18), 0, 9999999999, chainId);

    const { key } = await createOrder(ctx.fixture, {
      account: user0,
      market: ctx.ethUsdMarket,
      initialCollateralToken: ctx.wnt,
      initialCollateralDeltaAmount: expandDecimals(10, 18),
      swapPath: [],
      sizeDeltaUsd: decimalToFloat(200 * 1000),
      triggerPrice: expandDecimals(5000, 12),
      acceptablePrice: expandDecimals(5001, 12),
      executionFee: ctx.executionFee,
      minOutputAmount: 0,
      orderType: OrderType.LimitIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    });

    const updateParams = {
      key,
      sizeDeltaUsd: decimalToFloat(150 * 1000),
      acceptablePrice: expandDecimals(5002, 12),
      triggerPrice: expandDecimals(5001, 12),
      minOutputAmount: 0,
      validFromTime: 0,
      autoCancel: false,
      executionFeeIncrease: 0,
    };

    const externalCalls = getRelayReentrancyCalls(reentrancyTest, wnt.address, expandDecimals(1, 15));
    const relayParams = await getRelayParams({
      tokenPermits: [tokenPermit],
      externalCalls,
      feeParams: {
        feeToken: wnt.address,
        feeAmount: 0,
        feeSwapPath: [],
      },
      deadline: 9999999999,
      desChainId: chainId,
      relayRouter: gelatoRelayRouter,
      signer: user0,
    });

    const signature = await getUpdateOrderSignature({
      signer: user0,
      relayParams,
      verifyingContract: gelatoRelayRouter.address,
      params: updateParams,
      chainId,
    });

    const calldata = gelatoRelayRouter.interface.encodeFunctionData("updateOrder", [
      { ...relayParams, signature },
      user0.address,
      updateParams,
    ]);

    const emptyRelayParams = getEmptyRelayParams(chainId);
    const reenterCalldata = gelatoRelayRouter.interface.encodeFunctionData("cancelOrder", [
      emptyRelayParams,
      user0.address,
      ethers.constants.HashZero,
    ]);
    await reentrancyTest.setReenterConfig(gelatoRelayRouter.address, reenterCalldata, 0, 1, false);

    await sendRelayTransaction({
      calldata,
      gelatoRelayFeeToken: wnt.address,
      gelatoRelayFeeAmount: 0,
      sender: relaySigner,
      relayRouter: gelatoRelayRouter,
    });

    await expectReentrancyGuard(reentrancyTest);
  },
  "GlvRouter.sendNativeToken -> GlvRouter.createGlvDeposit": async (ctx) => {
    const { user0 } = ctx.fixture.accounts;
    const { dataStore, glvRouter } = ctx.fixture.contracts;
    const reentrancyTest = await deployContract("ReentrancyTest", []);

    const reenterCalldata = glvRouter.interface.encodeFunctionData("createGlvDeposit", [getEmptyGlvDepositParams()]);
    await reentrancyTest.setReenterConfig(glvRouter.address, reenterCalldata, 0, 1, false);

    await dataStore.setUint(keys.NATIVE_TOKEN_TRANSFER_GAS_LIMIT, bigNumberify(2_000_000));

    const amount = expandDecimals(1, 15);
    await glvRouter.connect(user0).sendNativeToken(reentrancyTest.address, amount, { value: amount });

    await expectReentrancyGuard(reentrancyTest);
  },
  "LayerZeroProvider.lzCompose -> LayerZeroProvider.bridgeOut": async (ctx) => {
    const { user0, wallet } = ctx.fixture.accounts;
    const { dataStore, layerZeroProvider, mockStargatePoolUsdc } = ctx.fixture.contracts;
    const reentrancyToken = await deployReentrantToken();

    const amount = expandDecimals(1, 18);

    await dataStore.setAddress(keys.HOLDING_ADDRESS, wallet.address);
    await dataStore.setUint(keys.tokenTransferGasLimit(reentrancyToken.address), 2_000_000);
    await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolUsdc.address), true);
    await dataStore.setBool(keys.isMultichainEndpointEnabledKey(user0.address), true);
    await dataStore.setUint(keys.eidToSrcChainId(1), 1);
    await mockStargatePoolUsdc.updateToken(reentrancyToken.address);

    await reentrancyToken.mint(layerZeroProvider.address, amount);

    const bridgeOutParams = {
      token: reentrancyToken.address,
      amount,
      minAmountOut: 0,
      provider: mockStargatePoolUsdc.address,
      data: ethers.utils.defaultAbiCoder.encode(["uint32"], [1]),
    };
    const reenterCalldata = layerZeroProvider.interface.encodeFunctionData("bridgeOut", [
      user0.address,
      1,
      bridgeOutParams,
    ]);
    await reentrancyToken.setReenterConfig(layerZeroProvider.address, reenterCalldata, 0, 1, false);

    const composeFrom = ethers.utils.hexZeroPad(user0.address, 32);
    const composeMsg = ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [user0.address, "0x"]);
    const message = ethers.utils.solidityPack(
      ["uint64", "uint32", "uint256", "bytes32", "bytes"],
      [1, 1, amount, composeFrom, composeMsg]
    );

    await layerZeroProvider
      .connect(user0)
      .lzCompose(mockStargatePoolUsdc.address, ethers.constants.HashZero, message, user0.address, "0x");

    await expectTokenReentrancyBlocked(reentrancyToken);
  },
  "LiquidationHandler.executeLiquidation -> OrderHandler.executeOrder": async (ctx) => {
    const { wallet, user0 } = ctx.fixture.accounts;
    const { roleStore, usdc, exchangeRouter, orderHandler } = ctx.fixture.contracts;
    const reentrancyTest = await deployContract("ReentrancyTest", []);

    await handleDeposit(ctx.fixture, {
      create: {
        market: ctx.ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
      },
    });

    await handleOrder(ctx.fixture, {
      create: {
        market: ctx.ethUsdMarket,
        initialCollateralToken: ctx.wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18),
        sizeDeltaUsd: decimalToFloat(200 * 1000),
        acceptablePrice: expandDecimals(5001, 12),
        orderType: OrderType.MarketIncrease,
        isLong: true,
      },
      execute: {
        tokens: [ctx.wnt.address, usdc.address],
      },
    });

    await grantRole(roleStore, wallet.address, "LIQUIDATION_KEEPER");
    await exchangeRouter.connect(user0).setSavedCallbackContract(ctx.ethUsdMarket.marketToken, reentrancyTest.address);

    const oracleParams = { tokens: [], providers: [], data: [] };
    const reenterCalldata = orderHandler.interface.encodeFunctionData("executeOrder", [
      ethers.constants.HashZero,
      oracleParams,
    ]);
    await reentrancyTest.setReenterConfig(orderHandler.address, reenterCalldata, 0, 1, false);

    await executeLiquidation(ctx.fixture, {
      account: user0.address,
      market: ctx.ethUsdMarket,
      collateralToken: ctx.wnt,
      isLong: true,
      minPrices: [expandDecimals(4000, 4), expandDecimals(1, 6)],
      maxPrices: [expandDecimals(4000, 4), expandDecimals(1, 6)],
    });

    await expectReentrancyGuard(reentrancyTest);
  },
  "MultichainClaimsRouter.claimAffiliateRewards -> MultichainClaimsRouter.claimFundingFees": async (ctx) => {
    const { user0 } = ctx.fixture.accounts;
    const { ethUsdMarket, multichainClaimsRouter, wnt, usdc } = ctx.fixture.contracts;
    const reentrancyTest = await deployContract("ReentrancyTest", []);
    const { relaySigner, chainId } = await setupMultichainRelay(ctx, user0);

    const markets = [ethUsdMarket.marketToken];
    const tokens = [usdc.address];
    const externalCalls = getRelayReentrancyCalls(reentrancyTest, wnt.address, expandDecimals(1, 15));

    const emptyRelayParams = getEmptyRelayParams(chainId);
    const reenterCalldata = multichainClaimsRouter.interface.encodeFunctionData("claimFundingFees", [
      emptyRelayParams,
      user0.address,
      chainId,
      markets,
      tokens,
      user0.address,
    ]);
    await reentrancyTest.setReenterConfig(multichainClaimsRouter.address, reenterCalldata, 0, 1, false);

    await sendClaimAffiliateRewards({
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: wnt.address,
        feeAmount: 0,
        feeSwapPath: [],
      },
      externalCalls: externalCalls as any,
      account: user0.address,
      params: {
        markets,
        tokens,
        receiver: user0.address,
      },
      deadline: 9999999999,
      srcChainId: chainId,
      desChainId: chainId,
      relayRouter: multichainClaimsRouter,
      chainId,
      relayFeeToken: wnt.address,
      relayFeeAmount: 0,
    });

    await expectReentrancyGuard(reentrancyTest);
  },
  "MultichainClaimsRouter.claimCollateral -> MultichainClaimsRouter.claimAffiliateRewards": async (ctx) => {
    const { user0 } = ctx.fixture.accounts;
    const { dataStore, ethUsdMarket, multichainClaimsRouter, wnt, usdc } = ctx.fixture.contracts;
    const reentrancyTest = await deployContract("ReentrancyTest", []);
    const { relaySigner, chainId } = await setupMultichainRelay(ctx, user0);

    await dataStore.setUint(keys.tokenTransferGasLimit(usdc.address), 2_000_000);
    await dataStore.setUint(keys.CLAIMABLE_COLLATERAL_DELAY, 0);
    await dataStore.setUint(keys.CLAIMABLE_COLLATERAL_TIME_DIVISOR, 1);

    const timeKey = 0;
    const claimableAmount = expandDecimals(1, 6);
    await dataStore.setUint(
      keys.claimableCollateralAmountKey(ethUsdMarket.marketToken, usdc.address, timeKey, user0.address),
      claimableAmount
    );
    await dataStore.setUint(keys.claimableCollateralAmountKey(ethUsdMarket.marketToken, usdc.address), claimableAmount);
    await usdc.mint(ethUsdMarket.marketToken, claimableAmount);

    const markets = [ethUsdMarket.marketToken];
    const tokens = [usdc.address];
    const timeKeys = [timeKey];
    const externalCalls = getRelayReentrancyCalls(reentrancyTest, wnt.address, expandDecimals(1, 15));

    const emptyRelayParams = getEmptyRelayParams(chainId);
    const reenterCalldata = multichainClaimsRouter.interface.encodeFunctionData("claimAffiliateRewards", [
      emptyRelayParams,
      user0.address,
      chainId,
      markets,
      tokens,
      user0.address,
    ]);
    await reentrancyTest.setReenterConfig(multichainClaimsRouter.address, reenterCalldata, 0, 1, false);

    await sendClaimCollateral({
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: wnt.address,
        feeAmount: 0,
        feeSwapPath: [],
      },
      externalCalls: externalCalls as any,
      account: user0.address,
      params: {
        markets,
        tokens,
        timeKeys,
        receiver: user0.address,
      },
      deadline: 9999999999,
      srcChainId: chainId,
      desChainId: chainId,
      relayRouter: multichainClaimsRouter,
      chainId,
      relayFeeToken: wnt.address,
      relayFeeAmount: 0,
    });

    await expectReentrancyGuard(reentrancyTest);
  },
  "MultichainClaimsRouter.claimFundingFees -> MultichainClaimsRouter.claimCollateral": async (ctx) => {
    const { user0 } = ctx.fixture.accounts;
    const { ethUsdMarket, multichainClaimsRouter, wnt, usdc } = ctx.fixture.contracts;
    const reentrancyTest = await deployContract("ReentrancyTest", []);
    const { relaySigner, chainId } = await setupMultichainRelay(ctx, user0);

    const markets = [ethUsdMarket.marketToken];
    const tokens = [usdc.address];
    const externalCalls = getRelayReentrancyCalls(reentrancyTest, wnt.address, expandDecimals(1, 15));

    const emptyRelayParams = getEmptyRelayParams(chainId);
    const reenterCalldata = multichainClaimsRouter.interface.encodeFunctionData("claimCollateral", [
      emptyRelayParams,
      user0.address,
      chainId,
      markets,
      tokens,
      [0],
      user0.address,
    ]);
    await reentrancyTest.setReenterConfig(multichainClaimsRouter.address, reenterCalldata, 0, 1, false);

    await sendClaimFundingFees({
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: wnt.address,
        feeAmount: 0,
        feeSwapPath: [],
      },
      externalCalls: externalCalls as any,
      account: user0.address,
      params: {
        markets,
        tokens,
        receiver: user0.address,
      },
      deadline: 9999999999,
      srcChainId: chainId,
      desChainId: chainId,
      relayRouter: multichainClaimsRouter,
      chainId,
      relayFeeToken: wnt.address,
      relayFeeAmount: 0,
    });

    await expectReentrancyGuard(reentrancyTest);
  },
  "MultichainClaimsRouter.sendNativeToken -> MultichainClaimsRouter.claimFundingFees": async (ctx) => {
    const { user0 } = ctx.fixture.accounts;
    const { dataStore, multichainClaimsRouter } = ctx.fixture.contracts;
    const reentrancyTest = await deployContract("ReentrancyTest", []);
    const chainId = await ethers.provider.getNetwork().then((network) => network.chainId);

    const emptyRelayParams = getEmptyRelayParams(chainId);
    const reenterCalldata = multichainClaimsRouter.interface.encodeFunctionData("claimFundingFees", [
      emptyRelayParams,
      user0.address,
      chainId,
      [ctx.ethUsdMarket.marketToken],
      [ctx.fixture.contracts.usdc.address],
      user0.address,
    ]);
    await reentrancyTest.setReenterConfig(multichainClaimsRouter.address, reenterCalldata, 0, 1, false);

    await dataStore.setUint(keys.NATIVE_TOKEN_TRANSFER_GAS_LIMIT, bigNumberify(2_000_000));

    const amount = expandDecimals(1, 15);
    await multichainClaimsRouter.connect(user0).sendNativeToken(reentrancyTest.address, amount, { value: amount });

    await expectReentrancyGuard(reentrancyTest);
  },
  "MultichainGlvRouter.sendNativeToken -> MultichainGlvRouter.createGlvDeposit": async (ctx) => {
    const { user0 } = ctx.fixture.accounts;
    const { dataStore, multichainGlvRouter } = ctx.fixture.contracts;
    const reentrancyTest = await deployContract("ReentrancyTest", []);
    const chainId = await ethers.provider.getNetwork().then((network) => network.chainId);

    const emptyRelayParams = getEmptyRelayParams(chainId);
    const emptyTransferRequests = { tokens: [], receivers: [], amounts: [] };
    const reenterCalldata = multichainGlvRouter.interface.encodeFunctionData("createGlvDeposit", [
      emptyRelayParams,
      user0.address,
      chainId,
      emptyTransferRequests,
      getEmptyGlvDepositParams(),
    ]);
    await reentrancyTest.setReenterConfig(multichainGlvRouter.address, reenterCalldata, 0, 1, false);

    await dataStore.setUint(keys.NATIVE_TOKEN_TRANSFER_GAS_LIMIT, bigNumberify(2_000_000));

    const amount = expandDecimals(1, 15);
    await multichainGlvRouter.connect(user0).sendNativeToken(reentrancyTest.address, amount, { value: amount });

    await expectReentrancyGuard(reentrancyTest);
  },
  /*
  "ExchangeRouter.cancelDeposit(bytes32)": async (ctx) => {
    const reentrancyTest = await deployContract("ReentrancyTest", []);
    const callbackGasLimit = await getCallbackGasLimit(ctx.dataStore);

    await createDeposit(ctx.fixture, {
      account: ctx.user0,
      callbackContract: reentrancyTest,
      callbackGasLimit,
      longTokenAmount: expandDecimals(10, 18),
      executionFee: ctx.executionFee,
    });

    const depositKeys = await getDepositKeys(ctx.dataStore, 0, 1);
    const reenterCalldata = ctx.exchangeRouter.interface.encodeFunctionData("setUiFeeFactor", [0]);
    await reentrancyTest.setReenterConfig(ctx.exchangeRouter.address, reenterCalldata, 0, 1, false);

    await increaseTimeForCancellation(ctx.dataStore);

    await ctx.exchangeRouter.connect(ctx.user0).cancelDeposit(depositKeys[0]);

    await expectReentrancyGuard(reentrancyTest);
  },

  "ExchangeRouter.cancelOrder(bytes32)": async (ctx) => {
    const reentrancyTest = await deployContract("ReentrancyTest", []);
    const callbackGasLimit = await getCallbackGasLimit(ctx.dataStore);

    const { key } = await createOrder(ctx.fixture, {
      market: ctx.ethUsdMarket,
      callbackContract: reentrancyTest,
      callbackGasLimit,
      initialCollateralToken: ctx.wnt,
      initialCollateralDeltaAmount: expandDecimals(10, 18),
      swapPath: [ctx.ethUsdMarket.marketToken],
      sizeDeltaUsd: decimalToFloat(200 * 1000),
      triggerPrice: expandDecimals(5000, 12),
      acceptablePrice: expandDecimals(5001, 12),
      executionFee: ctx.executionFee,
      minOutputAmount: expandDecimals(50_000, 6),
      orderType: OrderType.LimitIncrease,
      isLong: true,
      shouldUnwrapNativeToken: false,
    });

    const reenterCalldata = ctx.exchangeRouter.interface.encodeFunctionData("setUiFeeFactor", [0]);
    await reentrancyTest.setReenterConfig(ctx.exchangeRouter.address, reenterCalldata, 0, 1, false);

    const refTime = (await ethers.provider.getBlock()).timestamp;
    await increaseTime(refTime, 300);

    await ctx.exchangeRouter.connect(ctx.user0).cancelOrder(key);

    await expectReentrancyGuard(reentrancyTest);
  },

  "ExchangeRouter.cancelShift(bytes32)": async (ctx) => {
    const reentrancyTest = await deployContract("ReentrancyTest", []);
    const callbackGasLimit = await getCallbackGasLimit(ctx.dataStore);
    const marketToken = await contractAt("MarketToken", ctx.ethUsdMarket.marketToken);

    await marketToken.mint(ctx.user0.address, expandDecimals(1, 18));
    await createShift(ctx.fixture, {
      account: ctx.user0,
      callbackContract: reentrancyTest,
      callbackGasLimit,
      marketTokenAmount: expandDecimals(1, 18),
      executionFee: ctx.executionFee,
    });

    const shiftKeys = await getShiftKeys(ctx.dataStore, 0, 1);
    const reenterCalldata = ctx.exchangeRouter.interface.encodeFunctionData("setUiFeeFactor", [0]);
    await reentrancyTest.setReenterConfig(ctx.exchangeRouter.address, reenterCalldata, 0, 1, false);

    await increaseTimeForCancellation(ctx.dataStore);

    await ctx.exchangeRouter.connect(ctx.user0).cancelShift(shiftKeys[0]);

    await expectReentrancyGuard(reentrancyTest);
  },

  "ExchangeRouter.cancelWithdrawal(bytes32)": async (ctx) => {
    const reentrancyTest = await deployContract("ReentrancyTest", []);
    const callbackGasLimit = await getCallbackGasLimit(ctx.dataStore);
    const marketToken = await contractAt("MarketToken", ctx.ethUsdMarket.marketToken);

    await marketToken.mint(ctx.user0.address, expandDecimals(1, 18));
    await createWithdrawal(ctx.fixture, {
      account: ctx.user0,
      callbackContract: reentrancyTest,
      callbackGasLimit,
      marketTokenAmount: expandDecimals(1, 18),
      executionFee: ctx.executionFee,
    });

    const withdrawalKeys = await getWithdrawalKeys(ctx.dataStore, 0, 1);
    const reenterCalldata = ctx.exchangeRouter.interface.encodeFunctionData("setUiFeeFactor", [0]);
    await reentrancyTest.setReenterConfig(ctx.exchangeRouter.address, reenterCalldata, 0, 1, false);

    await increaseTimeForCancellation(ctx.dataStore);

    await ctx.exchangeRouter.connect(ctx.user0).cancelWithdrawal(withdrawalKeys[0]);

    await expectReentrancyGuard(reentrancyTest);
  },

  "ExchangeRouter.makeExternalCalls(address[],bytes[],address[],address[])": async (ctx) => {
    const reentrancyTest = await deployContract("ReentrancyTest", []);
    const reenterCalldata = ctx.exchangeRouter.interface.encodeFunctionData("setUiFeeFactor", [0]);
    await reentrancyTest.setReenterConfig(ctx.exchangeRouter.address, reenterCalldata, 0, 1, false);

    const externalCallData = FALLBACK_CALLDATA;

    await ctx.exchangeRouter.connect(ctx.user0).makeExternalCalls(
      [reentrancyTest.address],
      [externalCallData],
      [],
      []
    );

    await expectReentrancyGuard(reentrancyTest);
  },

  "ExchangeRouter.sendNativeToken(address,uint256)": async (ctx) => {
    const reentrancyTest = await deployContract("ReentrancyTest", []);
    const reenterCalldata = ctx.exchangeRouter.interface.encodeFunctionData("setUiFeeFactor", [0]);
    await reentrancyTest.setReenterConfig(ctx.exchangeRouter.address, reenterCalldata, 0, 1, false);

    await ctx.dataStore.setUint(keys.NATIVE_TOKEN_TRANSFER_GAS_LIMIT, bigNumberify(2_000_000));

    const amount = expandDecimals(1, 15);
    await ctx.exchangeRouter.connect(ctx.user0).sendNativeToken(reentrancyTest.address, amount, { value: amount });

    await expectReentrancyGuard(reentrancyTest);
  },

  "OrderHandler.executeOrder(bytes32,(address[],address[],bytes[])) -> ExchangeRouter.cancelOrder(bytes32)": async (ctx) => {
    const reentrancyTest = await deployContract("ReentrancyTest", []);

    const key = await createOrderForCallback(ctx, reentrancyTest);
    const reenterCalldata = ctx.exchangeRouter.interface.encodeFunctionData("cancelOrder", [ethers.constants.HashZero]);
    await reentrancyTest.setReenterConfig(ctx.exchangeRouter.address, reenterCalldata, 0, 1, false);

    await executeOrder(ctx.fixture, { orderKey: key });

    await expectReentrancyBlocked(reentrancyTest);
  },

  "OrderHandler.executeOrder(bytes32,(address[],address[],bytes[])) -> ExchangeRouter.updateOrder(bytes32,uint256,uint256,uint256,uint256,uint256,bool)": async (ctx) => {
    const reentrancyTest = await deployContract("ReentrancyTest", []);

    const key = await createOrderForCallback(ctx, reentrancyTest);
    const reenterCalldata = ctx.exchangeRouter.interface.encodeFunctionData("updateOrder", [
      ethers.constants.HashZero,
      0,
      0,
      0,
      0,
      0,
      false,
    ]);
    await reentrancyTest.setReenterConfig(ctx.exchangeRouter.address, reenterCalldata, 0, 1, false);

    await executeOrder(ctx.fixture, { orderKey: key });

    await expectReentrancyBlocked(reentrancyTest);
  },

  "OrderHandler.executeOrder(bytes32,(address[],address[],bytes[])) -> ExchangeRouter.createOrder((address,address,address,address,address,address,address[]),(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256),uint8,uint8,bool,bool,bool,bytes32,bytes32[])": async (ctx) => {
    const reentrancyTest = await deployContract("ReentrancyTest", []);

    const key = await createOrderForCallback(ctx, reentrancyTest);
    const invalidCreateOrderParams = {
      addresses: {
        receiver: ethers.constants.AddressZero,
        cancellationReceiver: ethers.constants.AddressZero,
        callbackContract: ethers.constants.AddressZero,
        uiFeeReceiver: ethers.constants.AddressZero,
        market: ethers.constants.AddressZero,
        initialCollateralToken: ethers.constants.AddressZero,
        swapPath: [],
      },
      numbers: {
        sizeDeltaUsd: 0,
        initialCollateralDeltaAmount: 0,
        triggerPrice: 0,
        acceptablePrice: 0,
        executionFee: 0,
        callbackGasLimit: 0,
        minOutputAmount: 0,
        validFromTime: 0,
      },
      orderType: 0,
      decreasePositionSwapType: 0,
      isLong: true,
      shouldUnwrapNativeToken: false,
      autoCancel: false,
      referralCode: ethers.constants.HashZero,
      dataList: [],
    };
    const reenterCalldata = ctx.exchangeRouter.interface.encodeFunctionData("createOrder", [invalidCreateOrderParams]);
    await reentrancyTest.setReenterConfig(ctx.exchangeRouter.address, reenterCalldata, 0, 1, false);

    await executeOrder(ctx.fixture, { orderKey: key });

    await expectReentrancyBlocked(reentrancyTest);
  },

  "OrderHandler.executeOrder(bytes32,(address[],address[],bytes[]))": async (ctx) => {
    const reentrancyTest = await deployContract("ReentrancyTest", []);
    const key = await createOrderForCallback(ctx, reentrancyTest);

    const oracleParams = { tokens: [], providers: [], data: [] };
    const reenterCalldata = ctx.orderHandler.interface.encodeFunctionData("executeOrder", [key, oracleParams]);
    await reentrancyTest.setReenterConfig(ctx.orderHandler.address, reenterCalldata, 0, 1, false);

    await executeOrder(ctx.fixture, { orderKey: key });

    await expectReentrancyGuard(reentrancyTest);
  },

  "LiquidationHandler.executeLiquidation(address,address,address,bool,(address[],address[],bytes[])) -> OrderHandler.executeOrder(bytes32,(address[],address[],bytes[]))": async (
    ctx
  ) => {
    const { wallet, user0 } = ctx.fixture.accounts;
    const { roleStore, usdc, exchangeRouter, orderHandler } = ctx.fixture.contracts;
    const reentrancyTest = await deployContract("ReentrancyTest", []);

    await handleDeposit(ctx.fixture, {
      create: {
        market: ctx.ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
      },
    });

    await handleOrder(ctx.fixture, {
      create: {
        market: ctx.ethUsdMarket,
        initialCollateralToken: ctx.wnt,
        initialCollateralDeltaAmount: expandDecimals(10, 18),
        sizeDeltaUsd: decimalToFloat(200 * 1000),
        acceptablePrice: expandDecimals(5001, 12),
        orderType: OrderType.MarketIncrease,
        isLong: true,
      },
      execute: {
        tokens: [ctx.wnt.address, usdc.address],
      },
    });

    await grantRole(roleStore, wallet.address, "LIQUIDATION_KEEPER");
    await exchangeRouter.connect(user0).setSavedCallbackContract(ctx.ethUsdMarket.marketToken, reentrancyTest.address);

    const oracleParams = { tokens: [], providers: [], data: [] };
    const reenterCalldata = orderHandler.interface.encodeFunctionData("executeOrder", [
      ethers.constants.HashZero,
      oracleParams,
    ]);
    await reentrancyTest.setReenterConfig(orderHandler.address, reenterCalldata, 0, 1, false);

    await executeLiquidation(ctx.fixture, {
      account: user0.address,
      market: ctx.ethUsdMarket,
      collateralToken: ctx.wnt,
      isLong: true,
      minPrices: [expandDecimals(4000, 4), expandDecimals(1, 6)],
      maxPrices: [expandDecimals(4000, 4), expandDecimals(1, 6)],
    });

    await expectReentrancyGuard(reentrancyTest);
  },

  "AdlHandler.executeAdl(address,address,address,bool,uint256,(address[],address[],bytes[])) -> LiquidationHandler.executeLiquidation(address,address,address,bool,(address[],address[],bytes[]))": async (
    ctx
  ) => {
    const { wallet, user0 } = ctx.fixture.accounts;
    const { roleStore, dataStore, wethPriceFeed, usdc, exchangeRouter, liquidationHandler } = ctx.fixture.contracts;
    const reentrancyTest = await deployContract("ReentrancyTest", []);

    await handleDeposit(ctx.fixture, {
      create: {
        market: ctx.ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
      },
    });

    await handleOrder(ctx.fixture, {
      create: {
        market: ctx.ethUsdMarket,
        initialCollateralToken: ctx.wnt,
        initialCollateralDeltaAmount: expandDecimals(100, 18),
        sizeDeltaUsd: decimalToFloat(2000 * 1000),
        acceptablePrice: expandDecimals(5001, 12),
        orderType: OrderType.MarketIncrease,
        isLong: true,
      },
    });

    const maxPnlFactorForAdlKey = keys.maxPnlFactorKey(keys.MAX_PNL_FACTOR_FOR_ADL, ctx.ethUsdMarket.marketToken, true);
    const minPnlFactorAfterAdlKey = keys.minPnlFactorAfterAdl(ctx.ethUsdMarket.marketToken, true);

    await dataStore.setUint(maxPnlFactorForAdlKey, decimalToFloat(10, 2));
    await dataStore.setUint(minPnlFactorAfterAdlKey, decimalToFloat(2, 2));
    await grantRole(roleStore, wallet.address, "ADL_KEEPER");

    await wethPriceFeed.setAnswer(expandDecimals(10000, 8));
    await updateAdlState(ctx.fixture, {
      market: ctx.ethUsdMarket,
      isLong: true,
      tokens: [ctx.wnt.address, usdc.address],
      minPrices: [expandDecimals(10000, 4), expandDecimals(1, 6)],
      maxPrices: [expandDecimals(10000, 4), expandDecimals(1, 6)],
    });

    await exchangeRouter.connect(user0).setSavedCallbackContract(ctx.ethUsdMarket.marketToken, reentrancyTest.address);

    const oracleParams = { tokens: [], providers: [], data: [] };
    const reenterCalldata = liquidationHandler.interface.encodeFunctionData("executeLiquidation", [
      user0.address,
      ctx.ethUsdMarket.marketToken,
      ctx.wnt.address,
      true,
      oracleParams,
    ]);
    await reentrancyTest.setReenterConfig(liquidationHandler.address, reenterCalldata, 0, 1, false);

    await executeAdl(ctx.fixture, {
      account: user0.address,
      market: ctx.ethUsdMarket,
      collateralToken: ctx.wnt,
      isLong: true,
      sizeDeltaUsd: decimalToFloat(100 * 1000),
      tokens: [ctx.wnt.address, usdc.address],
      minPrices: [expandDecimals(10000, 4), expandDecimals(1, 6)],
      maxPrices: [expandDecimals(10000, 4), expandDecimals(1, 6)],
    });

    await expectReentrancyGuard(reentrancyTest);
  },

  "GelatoRelayRouter.createOrder(((address[],address[],bytes[]),(address[],uint256[],address[],bytes[],address[],address[]),(address,address,uint256,uint256,uint8,bytes32,bytes32,address)[],(address,uint256,address[]),uint256,uint256,bytes,uint256),address,((address,address,address,address,address,address,address[]),(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256),uint8,uint8,bool,bool,bool,bytes32,bytes32[])) -> GelatoRelayRouter.cancelOrder(((address[],address[],bytes[]),(address[],uint256[],address[],bytes[],address[],address[]),(address,address,uint256,uint256,uint8,bytes32,bytes32,address)[],(address,uint256,address[]),uint256,uint256,bytes,uint256),address,bytes32)": async (
    ctx
  ) => {
    const { user0 } = ctx.fixture.accounts;
    const { dataStore, gelatoRelayRouter, router, wnt } = ctx.fixture.contracts;
    const reentrancyTest = await deployContract("ReentrancyTest", []);
    const { relaySigner, chainId } = await getRelaySignerAndChainId();

    await dataStore.setBool(keys.isSrcChainIdEnabledKey(chainId), true);
    await wnt.connect(user0).deposit({ value: expandDecimals(1, 18) });

    const tokenPermit = await getTokenPermit(
      wnt,
      user0,
      router.address,
      expandDecimals(1, 18),
      0,
      9999999999,
      chainId
    );

    const params = getDefaultRelayOrderParams(ctx);
    const externalCalls = getRelayReentrancyCalls(reentrancyTest, wnt.address, expandDecimals(1, 15));

    const createOrderParams = {
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: wnt.address,
        feeAmount: expandDecimals(2, 15),
        feeSwapPath: [],
      },
      tokenPermits: [tokenPermit],
      account: user0.address,
      params,
      deadline: 9999999999,
      desChainId: chainId,
      relayRouter: gelatoRelayRouter,
      chainId,
      gelatoRelayFeeToken: wnt.address,
      gelatoRelayFeeAmount: expandDecimals(1, 15),
      externalCalls,
    };

    const emptyRelayParams = getEmptyRelayParams(chainId);
    const reenterCalldata = gelatoRelayRouter.interface.encodeFunctionData("cancelOrder", [
      emptyRelayParams,
      user0.address,
      ethers.constants.HashZero,
    ]);
    await reentrancyTest.setReenterConfig(gelatoRelayRouter.address, reenterCalldata, 0, 1, false);

    await sendGelatoCreateOrder(createOrderParams);

    await expectReentrancyGuard(reentrancyTest);
  },

  "GelatoRelayRouter.batch(((address[],address[],bytes[]),(address[],uint256[],address[],bytes[],address[],address[]),(address,address,uint256,uint256,uint8,bytes32,bytes32,address)[],(address,uint256,address[]),uint256,uint256,bytes,uint256),address,(((address,address,address,address,address,address,address[]),(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256),uint8,uint8,bool,bool,bool,bytes32,bytes32[])[],(bytes32,uint256,uint256,uint256,uint256,uint256,bool,uint256)[],bytes32[])) -> GelatoRelayRouter.updateOrder(((address[],address[],bytes[]),(address[],uint256[],address[],bytes[],address[],address[]),(address,address,uint256,uint256,uint8,bytes32,bytes32,address)[],(address,uint256,address[]),uint256,uint256,bytes,uint256),address,(bytes32,uint256,uint256,uint256,uint256,uint256,bool,uint256))": async (
    ctx
  ) => {
    const { user0 } = ctx.fixture.accounts;
    const { dataStore, gelatoRelayRouter, router, wnt } = ctx.fixture.contracts;
    const reentrancyTest = await deployContract("ReentrancyTest", []);
    const { relaySigner, chainId } = await getRelaySignerAndChainId();

    await dataStore.setBool(keys.isSrcChainIdEnabledKey(chainId), true);
    await wnt.connect(user0).deposit({ value: expandDecimals(1, 18) });

    const tokenPermit = await getTokenPermit(
      wnt,
      user0,
      router.address,
      expandDecimals(1, 18),
      0,
      9999999999,
      chainId
    );

    const params = getDefaultRelayOrderParams(ctx);
    const externalCalls = getRelayReentrancyCalls(reentrancyTest, wnt.address, expandDecimals(1, 15));

    const batchParams: any = {
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: wnt.address,
        feeAmount: expandDecimals(2, 15),
        feeSwapPath: [],
      },
      tokenPermits: [tokenPermit],
      account: user0.address,
      userNonce: 1,
      createOrderParamsList: [params],
      updateOrderParamsList: [],
      cancelOrderKeys: [],
      deadline: 9999999999,
      relayRouter: gelatoRelayRouter,
      chainId,
      desChainId: chainId,
      gelatoRelayFeeToken: wnt.address,
      gelatoRelayFeeAmount: expandDecimals(1, 15),
      externalCalls,
    };

    const emptyRelayParams = getEmptyRelayParams(chainId);
    const reenterCalldata = gelatoRelayRouter.interface.encodeFunctionData("updateOrder", [
      emptyRelayParams,
      user0.address,
      {
        key: ethers.constants.HashZero,
        sizeDeltaUsd: 0,
        acceptablePrice: 0,
        triggerPrice: 0,
        minOutputAmount: 0,
        validFromTime: 0,
        autoCancel: false,
        executionFeeIncrease: 0,
      },
    ]);
    await reentrancyTest.setReenterConfig(gelatoRelayRouter.address, reenterCalldata, 0, 1, false);

    await sendGelatoBatch(batchParams);

    await expectReentrancyGuard(reentrancyTest);
  },

  "MultichainOrderRouter.createOrder(((address[],address[],bytes[]),(address[],uint256[],address[],bytes[],address[],address[]),(address,address,uint256,uint256,uint8,bytes32,bytes32,address)[],(address,uint256,address[]),uint256,uint256,bytes,uint256),address,uint256,((address,address,address,address,address,address,address[]),(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256),uint8,uint8,bool,bool,bool,bytes32,bytes32[])) -> MultichainOrderRouter.cancelOrder(((address[],address[],bytes[]),(address[],uint256[],address[],bytes[],address[],address[]),(address,address,uint256,uint256,uint8,bytes32,bytes32,address)[],(address,uint256,address[]),uint256,uint256,bytes,uint256),address,uint256,bytes32)": async (
    ctx
  ) => {
    const { user0 } = ctx.fixture.accounts;
    const { dataStore, multichainOrderRouter, wnt, mockStargatePoolNative, mockStargatePoolUsdc } =
      ctx.fixture.contracts;
    const reentrancyTest = await deployContract("ReentrancyTest", []);
    const { relaySigner, chainId } = await getRelaySignerAndChainId();

    await dataStore.setBool(keys.isSrcChainIdEnabledKey(chainId), true);
    await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolNative.address), true);
    await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolNative.address), true);
    await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolUsdc.address), true);
    await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolUsdc.address), true);
    await bridgeInTokens(ctx.fixture, { account: user0, amount: expandDecimals(5, 18) });

    const params = getDefaultRelayOrderParams(ctx);
    const externalCalls = getRelayReentrancyCalls(reentrancyTest, wnt.address, expandDecimals(1, 15));

    const createOrderParams: any = {
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: wnt.address,
        feeAmount: expandDecimals(2, 15),
        feeSwapPath: [],
      },
      account: user0.address,
      params,
      deadline: 9999999999,
      chainId,
      srcChainId: chainId,
      desChainId: chainId,
      relayRouter: multichainOrderRouter,
      relayFeeToken: wnt.address,
      relayFeeAmount: expandDecimals(1, 15),
      externalCalls,
    };

    const emptyRelayParams = getEmptyRelayParams(chainId);
    const reenterCalldata = multichainOrderRouter.interface.encodeFunctionData("cancelOrder", [
      emptyRelayParams,
      user0.address,
      chainId,
      ethers.constants.HashZero,
    ]);
    await reentrancyTest.setReenterConfig(multichainOrderRouter.address, reenterCalldata, 0, 1, false);

    await sendMultichainCreateOrder(createOrderParams);

    await expectReentrancyGuard(reentrancyTest);
  },

  "MultichainTransferRouter.bridgeOut(((address[],address[],bytes[]),(address[],uint256[],address[],bytes[],address[],address[]),(address,address,uint256,uint256,uint8,bytes32,bytes32,address)[],(address,uint256,address[]),uint256,uint256,bytes,uint256),address,uint256,(address,uint256,uint256,address,bytes)) -> MultichainTransferRouter.bridgeIn(address,address)": async (
    ctx
  ) => {
    const { user0 } = ctx.fixture.accounts;
    const { dataStore, multichainTransferRouter, wnt, mockStargatePoolNative, mockStargatePoolUsdc } =
      ctx.fixture.contracts;
    const reentrancyToken = await deployReentrantToken();
    const { relaySigner, chainId } = await getRelaySignerAndChainId();

    await dataStore.setBool(keys.isSrcChainIdEnabledKey(chainId), true);
    await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolNative.address), true);
    await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolNative.address), true);
    await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolUsdc.address), true);
    await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolUsdc.address), true);
    await dataStore.setUint(keys.tokenTransferGasLimit(reentrancyToken.address), 30_000_000);
    await mockStargatePoolUsdc.updateToken(reentrancyToken.address);
    await bridgeInTokens(ctx.fixture, { account: user0, token: reentrancyToken, amount: expandDecimals(10, 18) });
    await bridgeInTokens(ctx.fixture, { account: user0, amount: expandDecimals(2, 18) });

    const reenterCalldata = multichainTransferRouter.interface.encodeFunctionData("bridgeIn", [
      user0.address,
      reentrancyToken.address,
    ]);
    await reentrancyToken.setReenterConfig(multichainTransferRouter.address, reenterCalldata, 0, 1, false);

    const bridgeOutParams = {
      token: reentrancyToken.address,
      amount: expandDecimals(1, 18),
      minAmountOut: 0,
      provider: ethers.constants.AddressZero,
      data: "0x",
    };

    await sendMultichainBridgeOut({
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: wnt.address,
        feeAmount: expandDecimals(2, 15),
        feeSwapPath: [],
      },
      account: user0.address,
      params: bridgeOutParams,
      deadline: 9999999999,
      srcChainId: chainId,
      desChainId: chainId,
      relayRouter: multichainTransferRouter,
      relayFeeToken: wnt.address,
      relayFeeAmount: expandDecimals(1, 15),
    });

    await expectTokenReentrancyGuard(reentrancyToken);
  },

  "ClaimHandler.acceptTermsAndClaim((address,uint256,bytes,string)[],address) -> ClaimHandler.withdrawFunds(address,(address,uint256)[],address)": async (
    ctx
  ) => {
    const { wallet, user0 } = ctx.fixture.accounts;
    const { roleStore, dataStore, claimHandler, claimVault } = ctx.fixture.contracts;
    const reentrancyToken = await deployReentrantToken();

    const distributionId = 1;
    const claimableAmount = expandDecimals(1, 18);

    await grantRole(roleStore, wallet.address, "CONTROLLER");
    await dataStore.setAddress(keys.HOLDING_ADDRESS, wallet.address);
    await dataStore.setUint(keys.tokenTransferGasLimit(reentrancyToken.address), 30_000_000);
    await dataStore.setUint(keys.claimableFundsAmountKey(user0.address, reentrancyToken.address, distributionId), claimableAmount);
    await dataStore.setUint(keys.totalClaimableFundsAmountKey(reentrancyToken.address), claimableAmount);
    await reentrancyToken.mint(claimVault.address, claimableAmount);

    const reenterCalldata = claimHandler.interface.encodeFunctionData("withdrawFunds", [
      reentrancyToken.address,
      [{ account: user0.address, distributionId }],
      user0.address,
    ]);
    await reentrancyToken.setReenterConfig(claimHandler.address, reenterCalldata, 0, 1, false);

    await claimHandler.connect(user0).acceptTermsAndClaim(
      [
        {
          token: reentrancyToken.address,
          distributionId,
          termsSignature: "0x",
          acceptedTerms: "",
        },
      ],
      user0.address
    );

    await expectTokenReentrancyGuard(reentrancyToken);
  },

  "ClaimHandler.withdrawFunds(address,(address,uint256)[],address) -> ClaimHandler.transferClaim(address,(address,uint256,address,address)[])": async (
    ctx
  ) => {
    const { wallet, user0, user1 } = ctx.fixture.accounts;
    const { roleStore, dataStore, claimHandler, claimVault } = ctx.fixture.contracts;
    const reentrancyToken = await deployReentrantToken();

    const distributionId = 1;
    const claimableAmount = expandDecimals(1, 18);

    await grantRole(roleStore, wallet.address, "CONTROLLER");
    await grantRole(roleStore, wallet.address, "TIMELOCK_MULTISIG");
    await dataStore.setAddress(keys.HOLDING_ADDRESS, wallet.address);
    await dataStore.setUint(keys.tokenTransferGasLimit(reentrancyToken.address), 30_000_000);

    await dataStore.setUint(keys.claimableFundsAmountKey(user0.address, reentrancyToken.address, distributionId), claimableAmount);
    await dataStore.setUint(keys.totalClaimableFundsAmountKey(reentrancyToken.address), claimableAmount);
    await reentrancyToken.mint(claimVault.address, claimableAmount.mul(2));

    const reenterCalldata = claimHandler.interface.encodeFunctionData("transferClaim", [
      reentrancyToken.address,
      [{ token: reentrancyToken.address, distributionId, fromAccount: user0.address, toAccount: user1.address }],
    ]);
    await reentrancyToken.setReenterConfig(claimHandler.address, reenterCalldata, 0, 1, false);

    await claimHandler.connect(wallet).withdrawFunds(
      reentrancyToken.address,
      [{ account: user0.address, distributionId }],
      user1.address
    );

    await expectTokenReentrancyGuard(reentrancyToken);
  },

  "FeeHandler.claimFees(address,address,uint256) -> FeeHandler.withdrawFees(address)": async (ctx) => {
    const { user0, wallet } = ctx.fixture.accounts;
    const { roleStore, dataStore, feeHandler } = ctx.fixture.contracts;
    const reentrancyToken = await deployReentrantToken();

    const feeAmount = expandDecimals(1, 18);

    await grantRole(roleStore, wallet.address, "CONTROLLER");
    await dataStore.setUint(keys.tokenTransferGasLimit(reentrancyToken.address), 200_000);
    await dataStore.setUint(keys.claimableFeeAmountKey(ctx.ethUsdMarket.marketToken, reentrancyToken.address), feeAmount);
    await reentrancyToken.mint(ctx.ethUsdMarket.marketToken, feeAmount);

    const reenterCalldata = feeHandler.interface.encodeFunctionData("withdrawFees", [reentrancyToken.address]);
    await reentrancyToken.setReenterConfig(feeHandler.address, reenterCalldata, 0, 1, false);

    await feeHandler.connect(user0).claimFees(ctx.ethUsdMarket.marketToken, reentrancyToken.address, 2);

    await expectTokenReentrancyGuard(reentrancyToken);
  },

  "ExchangeRouter.sendNativeToken(address,uint256) -> ExchangeRouter.cancelOrder(bytes32)": async (ctx) => {
    const reentrancyTest = await deployContract("ReentrancyTest", []);
    const reenterCalldata = ctx.exchangeRouter.interface.encodeFunctionData("cancelOrder", [ethers.constants.HashZero]);
    await reentrancyTest.setReenterConfig(ctx.exchangeRouter.address, reenterCalldata, 0, 1, false);

    await ctx.dataStore.setUint(keys.NATIVE_TOKEN_TRANSFER_GAS_LIMIT, bigNumberify(2_000_000));

    const amount = expandDecimals(1, 15);
    await ctx.exchangeRouter.connect(ctx.user0).sendNativeToken(reentrancyTest.address, amount, { value: amount });

    await expectReentrancyGuard(reentrancyTest);
  },

  "Router.pluginTransfer(address,address,address,uint256) -> ExchangeRouter.createOrder((address,address,address,address,address,address,address[]),(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256),uint8,uint8,bool,bool,bool,bytes32,bytes32[])": async (
    ctx
  ) => {
    const { wallet, user0 } = ctx.fixture.accounts;
    const { roleStore, router } = ctx.fixture.contracts;
    const reentrancyToken = await deployReentrantToken();

    await grantRole(roleStore, wallet.address, "ROUTER_PLUGIN");

    await reentrancyToken.mint(user0.address, expandDecimals(1, 18));
    await reentrancyToken.connect(user0).approve(router.address, expandDecimals(1, 18));

    const invalidCreateOrderParams = {
      addresses: {
        receiver: ethers.constants.AddressZero,
        cancellationReceiver: ethers.constants.AddressZero,
        callbackContract: ethers.constants.AddressZero,
        uiFeeReceiver: ethers.constants.AddressZero,
        market: ethers.constants.AddressZero,
        initialCollateralToken: ethers.constants.AddressZero,
        swapPath: [],
      },
      numbers: {
        sizeDeltaUsd: 0,
        initialCollateralDeltaAmount: 0,
        triggerPrice: 0,
        acceptablePrice: 0,
        executionFee: 0,
        callbackGasLimit: 0,
        minOutputAmount: 0,
        validFromTime: 0,
      },
      orderType: 0,
      decreasePositionSwapType: 0,
      isLong: true,
      shouldUnwrapNativeToken: false,
      autoCancel: false,
      referralCode: ethers.constants.HashZero,
      dataList: [],
    };
    const reenterCalldata = ctx.exchangeRouter.interface.encodeFunctionData("createOrder", [invalidCreateOrderParams]);
    await reentrancyToken.setReenterConfig(ctx.exchangeRouter.address, reenterCalldata, 0, 1, false);

    await router
      .connect(wallet)
      .pluginTransfer(reentrancyToken.address, user0.address, wallet.address, expandDecimals(1, 18));

    await expectTokenReentrancyBlocked(reentrancyToken);
  },
  */
};
