import { expect } from "chai";
import { impersonateAccount, setBalance } from "@nomicfoundation/hardhat-network-helpers";

import { contractAt, deployContract } from "../../utils/deploy";
import { handleDeposit } from "../../utils/deposit";
import { createOrder, handleOrder, DecreasePositionSwapType, OrderType, getOrderKeys } from "../../utils/order";
import { decimalToFloat, expandDecimals, bigNumberify } from "../../utils/math";
import { increaseTime } from "../../utils/time";
import { parseError } from "../../utils/error";
import { grantRole } from "../../utils/role";
import { encodeData, hashString } from "../../utils/hash";
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
  sendUpdateOrder as sendGelatoUpdateOrder,
  sendRegisterCode,
  sendSetTraderReferralCode,
} from "../../utils/relay/gelatoRelay";
import {
  getEmptySubaccountApproval,
  sendBatch as sendSubaccountBatch,
  sendCancelOrder as sendSubaccountCancelOrder,
  sendCreateOrder as sendSubaccountCreateOrder,
  sendRemoveSubaccount as sendSubaccountRemoveSubaccount,
  sendUpdateOrder as sendSubaccountUpdateOrder,
} from "../../utils/relay/subaccountGelatoRelay";
import {
  sendBridgeOut as sendMultichainBridgeOut,
  sendCreateDeposit,
  sendCreateGlvWithdrawal,
  sendCreateShift,
  sendCreateWithdrawal,
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
const RELAY_FEE_AMOUNT = expandDecimals(2, 15);
const EXECUTION_FEE = expandDecimals(4, 15);
const EXTERNAL_CALL_AMOUNT = expandDecimals(1, 15);

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

async function expectTokenReentrancyGuard(reentrantToken) {
  expect(await reentrantToken.reenterDepth()).eq(1);
  expect(await reentrantToken.lastReenterSuccess()).eq(false);

  const lastResult = await reentrantToken.lastReenterResult();
  const parsed = parseError(lastResult, false);
  expect(parsed?.name).eq("Error");
  expect(parsed?.args?.[0]).eq("ReentrancyGuard: reentrant call");
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

function getSubaccountOrderParams(ctx, accountAddress: string, overrides: Partial<any> = {}) {
  const base = getDefaultRelayOrderParams(ctx);
  const params = {
    ...base,
    addresses: {
      ...base.addresses,
      receiver: accountAddress,
      cancellationReceiver: accountAddress,
    },
    numbers: {
      ...base.numbers,
      executionFee: EXECUTION_FEE,
    },
  };

  return {
    ...params,
    ...overrides,
    addresses: { ...params.addresses, ...(overrides as any).addresses },
    numbers: { ...params.numbers, ...(overrides as any).numbers },
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

function getEmptyTransferRequests() {
  return { tokens: [], receivers: [], amounts: [] };
}

function getEmptyDepositParams() {
  return {
    addresses: {
      receiver: ethers.constants.AddressZero,
      callbackContract: ethers.constants.AddressZero,
      uiFeeReceiver: ethers.constants.AddressZero,
      market: ethers.constants.AddressZero,
      initialLongToken: ethers.constants.AddressZero,
      initialShortToken: ethers.constants.AddressZero,
      longTokenSwapPath: [],
      shortTokenSwapPath: [],
    },
    minMarketTokens: 0,
    shouldUnwrapNativeToken: false,
    executionFee: 0,
    callbackGasLimit: 0,
    dataList: [],
  };
}

function getEmptyWithdrawalParams() {
  return {
    addresses: {
      receiver: ethers.constants.AddressZero,
      callbackContract: ethers.constants.AddressZero,
      uiFeeReceiver: ethers.constants.AddressZero,
      market: ethers.constants.AddressZero,
      longTokenSwapPath: [],
      shortTokenSwapPath: [],
    },
    minLongTokenAmount: 0,
    minShortTokenAmount: 0,
    shouldUnwrapNativeToken: false,
    executionFee: 0,
    callbackGasLimit: 0,
    dataList: [],
  };
}

function getEmptyShiftParams() {
  return {
    addresses: {
      receiver: ethers.constants.AddressZero,
      callbackContract: ethers.constants.AddressZero,
      uiFeeReceiver: ethers.constants.AddressZero,
      fromMarket: ethers.constants.AddressZero,
      toMarket: ethers.constants.AddressZero,
    },
    minMarketTokens: 0,
    executionFee: 0,
    callbackGasLimit: 0,
    dataList: [],
  };
}

async function deployReentrantToken() {
  return deployContract("ReentrantToken", ["ReentrantToken", "RNT", 18]);
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

async function seedMultichainBalance(
  ctx,
  account,
  tokenAddress,
  amount,
  tokenName: "MarketToken" | "GlvToken" = "MarketToken"
) {
  const { dataStore, multichainVault } = ctx.fixture.contracts;
  const { wallet } = ctx.fixture.accounts;
  const token = await contractAt(tokenName, tokenAddress);
  const accountAddress = typeof account === "string" ? account : account.address;

  await token.connect(wallet).mint(multichainVault.address, amount);

  const balanceKey = keys.multichainBalanceKey(accountAddress, tokenAddress);
  const currentBalance = await dataStore.getUint(balanceKey);
  await dataStore.connect(wallet).setUint(balanceKey, currentBalance.add(amount));
}

async function seedMultichainBalanceForToken(ctx, account, token, amount) {
  const { dataStore, multichainVault } = ctx.fixture.contracts;
  const { wallet } = ctx.fixture.accounts;
  const accountAddress = typeof account === "string" ? account : account.address;

  await token.connect(wallet).mint(multichainVault.address, amount);

  const balanceKey = keys.multichainBalanceKey(accountAddress, token.address);
  const currentBalance = await dataStore.getUint(balanceKey);
  await dataStore.connect(wallet).setUint(balanceKey, currentBalance.add(amount));
}

async function enableSubaccount(ctx, account, subaccount) {
  const { dataStore } = ctx.fixture.contracts;
  const accountAddress = typeof account === "string" ? account : account.address;
  const subaccountAddress = typeof subaccount === "string" ? subaccount : subaccount.address;

  await dataStore.addAddress(keys.subaccountListKey(accountAddress), subaccountAddress);
  await dataStore.setUint(
    keys.subaccountExpiresAtKey(accountAddress, subaccountAddress, keys.SUBACCOUNT_ORDER_ACTION),
    9999999999
  );
  await dataStore.setUint(
    keys.maxAllowedSubaccountActionCountKey(accountAddress, subaccountAddress, keys.SUBACCOUNT_ORDER_ACTION),
    10
  );
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

    expect(await reentrancyToken.reenterDepth()).eq(1);
    expect(await reentrancyToken.lastReenterSuccess()).eq(false);

    const lastResult = await reentrancyToken.lastReenterResult();
    const parsed = parseError(lastResult, false);
    expect(parsed?.name).eq("Unauthorized");
    expect(parsed?.args?.[1]).eq("CONTROLLER");
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
  "MultichainGlvRouter.createGlvWithdrawal -> MultichainGlvRouter.createGlvDeposit": async (ctx) => {
    const { user0 } = ctx.fixture.accounts;
    const { dataStore, multichainGlvRouter, glvVault, ethUsdGlvAddress, wnt } = ctx.fixture.contracts;
    const reentrancyTest = await deployContract("ReentrancyTest", []);

    const feeAmount = EXECUTION_FEE.add(RELAY_FEE_AMOUNT);
    const { relaySigner, chainId } = await setupMultichainRelay(ctx, user0, feeAmount.add(EXTERNAL_CALL_AMOUNT));

    await dataStore.setUint(keys.tokenTransferGasLimit(ethUsdGlvAddress), 2_000_000);

    const glvAmount = expandDecimals(1_000, 18);
    await seedMultichainBalance(ctx, user0, ethUsdGlvAddress, glvAmount, "GlvToken");

    const emptyRelayParams = getEmptyRelayParams(chainId);
    const reenterCalldata = multichainGlvRouter.interface.encodeFunctionData("createGlvDeposit", [
      emptyRelayParams,
      user0.address,
      chainId,
      getEmptyTransferRequests(),
      getEmptyGlvDepositParams(),
    ]);
    await reentrancyTest.setReenterConfig(multichainGlvRouter.address, reenterCalldata, 0, 1, false);

    const externalCalls = getRelayReentrancyCalls(reentrancyTest, wnt.address, EXTERNAL_CALL_AMOUNT);
    const createGlvWithdrawalParams: any = {
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: wnt.address,
        feeAmount,
        feeSwapPath: [],
      },
      transferRequests: {
        tokens: [ethUsdGlvAddress],
        receivers: [glvVault.address],
        amounts: [glvAmount],
      },
      account: user0.address,
      params: {
        addresses: {
          receiver: user0.address,
          callbackContract: user0.address,
          uiFeeReceiver: user0.address,
          market: ctx.ethUsdMarket.marketToken,
          glv: ethUsdGlvAddress,
          longTokenSwapPath: [],
          shortTokenSwapPath: [],
        },
        minLongTokenAmount: 0,
        minShortTokenAmount: 0,
        shouldUnwrapNativeToken: false,
        executionFee: EXECUTION_FEE,
        callbackGasLimit: "200000",
        dataList: [],
      },
      deadline: 9999999999,
      chainId,
      srcChainId: chainId,
      desChainId: chainId,
      relayRouter: multichainGlvRouter,
      relayFeeToken: wnt.address,
      relayFeeAmount: RELAY_FEE_AMOUNT,
      externalCalls,
    };

    await sendCreateGlvWithdrawal(createGlvWithdrawalParams);

    await expectReentrancyGuard(reentrancyTest);
  },
  "MultichainGmRouter.createDeposit -> MultichainGmRouter.createWithdrawal": async (ctx) => {
    const { user0 } = ctx.fixture.accounts;
    const { dataStore, multichainGmRouter, depositVault, ethUsdMarket, wnt, usdc } = ctx.fixture.contracts;
    const reentrancyTest = await deployContract("ReentrancyTest", []);

    const wntAmount = expandDecimals(1, 18);
    const usdcAmount = expandDecimals(1_000, 6);
    const feeAmount = EXECUTION_FEE.add(RELAY_FEE_AMOUNT);
    const totalWntAmount = wntAmount.add(feeAmount).add(EXTERNAL_CALL_AMOUNT);
    const { relaySigner, chainId } = await setupMultichainRelay(ctx, user0, totalWntAmount);

    await dataStore.setUint(keys.tokenTransferGasLimit(usdc.address), 2_000_000);
    await bridgeInTokens(ctx.fixture, { account: user0, token: usdc, amount: usdcAmount });

    const emptyRelayParams = getEmptyRelayParams(chainId);
    const reenterCalldata = multichainGmRouter.interface.encodeFunctionData("createWithdrawal", [
      emptyRelayParams,
      user0.address,
      chainId,
      getEmptyTransferRequests(),
      getEmptyWithdrawalParams(),
    ]);
    await reentrancyTest.setReenterConfig(multichainGmRouter.address, reenterCalldata, 0, 1, false);

    const externalCalls = getRelayReentrancyCalls(reentrancyTest, wnt.address, EXTERNAL_CALL_AMOUNT);
    const createDepositParams: any = {
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: wnt.address,
        feeAmount,
        feeSwapPath: [],
      },
      transferRequests: {
        tokens: [wnt.address, usdc.address],
        receivers: [depositVault.address, depositVault.address],
        amounts: [wntAmount, usdcAmount],
      },
      account: user0.address,
      params: {
        addresses: {
          receiver: user0.address,
          callbackContract: user0.address,
          uiFeeReceiver: user0.address,
          market: ethUsdMarket.marketToken,
          initialLongToken: ethUsdMarket.longToken,
          initialShortToken: ethUsdMarket.shortToken,
          longTokenSwapPath: [],
          shortTokenSwapPath: [],
        },
        minMarketTokens: 100,
        shouldUnwrapNativeToken: false,
        executionFee: EXECUTION_FEE,
        callbackGasLimit: "200000",
        dataList: [],
      },
      deadline: 9999999999,
      chainId,
      srcChainId: chainId,
      desChainId: chainId,
      relayRouter: multichainGmRouter,
      relayFeeToken: wnt.address,
      relayFeeAmount: RELAY_FEE_AMOUNT,
      externalCalls,
    };

    await sendCreateDeposit(createDepositParams);

    await expectReentrancyGuard(reentrancyTest);
  },
  "MultichainGmRouter.createShift -> MultichainGmRouter.createDeposit": async (ctx) => {
    const { user0 } = ctx.fixture.accounts;
    const { dataStore, multichainGmRouter, shiftVault, ethUsdMarket, solUsdMarket, wnt } = ctx.fixture.contracts;
    const reentrancyTest = await deployContract("ReentrancyTest", []);

    const feeAmount = EXECUTION_FEE.add(RELAY_FEE_AMOUNT);
    const { relaySigner, chainId } = await setupMultichainRelay(ctx, user0, feeAmount.add(EXTERNAL_CALL_AMOUNT));

    await dataStore.setUint(keys.tokenTransferGasLimit(ethUsdMarket.marketToken), 2_000_000);

    const marketTokenAmount = expandDecimals(1_000, 18);
    await seedMultichainBalance(ctx, user0, ethUsdMarket.marketToken, marketTokenAmount);

    const emptyRelayParams = getEmptyRelayParams(chainId);
    const reenterCalldata = multichainGmRouter.interface.encodeFunctionData("createDeposit", [
      emptyRelayParams,
      user0.address,
      chainId,
      getEmptyTransferRequests(),
      getEmptyDepositParams(),
    ]);
    await reentrancyTest.setReenterConfig(multichainGmRouter.address, reenterCalldata, 0, 1, false);

    const externalCalls = getRelayReentrancyCalls(reentrancyTest, wnt.address, EXTERNAL_CALL_AMOUNT);
    const createShiftParams: any = {
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: wnt.address,
        feeAmount,
        feeSwapPath: [],
      },
      transferRequests: {
        tokens: [ethUsdMarket.marketToken],
        receivers: [shiftVault.address],
        amounts: [marketTokenAmount],
      },
      account: user0.address,
      params: {
        addresses: {
          receiver: user0.address,
          callbackContract: user0.address,
          uiFeeReceiver: user0.address,
          fromMarket: ethUsdMarket.marketToken,
          toMarket: solUsdMarket.marketToken,
        },
        minMarketTokens: 0,
        executionFee: EXECUTION_FEE,
        callbackGasLimit: "200000",
        dataList: [],
      },
      deadline: 9999999999,
      chainId,
      srcChainId: chainId,
      desChainId: chainId,
      relayRouter: multichainGmRouter,
      relayFeeToken: wnt.address,
      relayFeeAmount: RELAY_FEE_AMOUNT,
      externalCalls,
    };

    await sendCreateShift(createShiftParams);

    await expectReentrancyGuard(reentrancyTest);
  },
  "MultichainGmRouter.createWithdrawal -> MultichainGmRouter.createShift": async (ctx) => {
    const { user0 } = ctx.fixture.accounts;
    const { dataStore, multichainGmRouter, withdrawalVault, ethUsdMarket, wnt } = ctx.fixture.contracts;
    const reentrancyTest = await deployContract("ReentrancyTest", []);

    const feeAmount = EXECUTION_FEE.add(RELAY_FEE_AMOUNT);
    const { relaySigner, chainId } = await setupMultichainRelay(ctx, user0, feeAmount.add(EXTERNAL_CALL_AMOUNT));

    await dataStore.setUint(keys.tokenTransferGasLimit(ethUsdMarket.marketToken), 2_000_000);

    const marketTokenAmount = expandDecimals(1_000, 18);
    await seedMultichainBalance(ctx, user0, ethUsdMarket.marketToken, marketTokenAmount);

    const emptyRelayParams = getEmptyRelayParams(chainId);
    const reenterCalldata = multichainGmRouter.interface.encodeFunctionData("createShift", [
      emptyRelayParams,
      user0.address,
      chainId,
      getEmptyTransferRequests(),
      getEmptyShiftParams(),
    ]);
    await reentrancyTest.setReenterConfig(multichainGmRouter.address, reenterCalldata, 0, 1, false);

    const externalCalls = getRelayReentrancyCalls(reentrancyTest, wnt.address, EXTERNAL_CALL_AMOUNT);
    const createWithdrawalParams: any = {
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: wnt.address,
        feeAmount,
        feeSwapPath: [],
      },
      transferRequests: {
        tokens: [ethUsdMarket.marketToken],
        receivers: [withdrawalVault.address],
        amounts: [marketTokenAmount],
      },
      account: user0.address,
      params: {
        addresses: {
          receiver: user0.address,
          callbackContract: user0.address,
          uiFeeReceiver: user0.address,
          market: ethUsdMarket.marketToken,
          longTokenSwapPath: [],
          shortTokenSwapPath: [],
        },
        minLongTokenAmount: 0,
        minShortTokenAmount: 0,
        shouldUnwrapNativeToken: false,
        executionFee: EXECUTION_FEE,
        callbackGasLimit: "200000",
        dataList: [],
      },
      deadline: 9999999999,
      chainId,
      srcChainId: chainId,
      desChainId: chainId,
      relayRouter: multichainGmRouter,
      relayFeeToken: wnt.address,
      relayFeeAmount: RELAY_FEE_AMOUNT,
      externalCalls,
    };

    await sendCreateWithdrawal(createWithdrawalParams);

    await expectReentrancyGuard(reentrancyTest);
  },
  "MultichainGmRouter.sendNativeToken -> MultichainGmRouter.createDeposit": async (ctx) => {
    const { user0 } = ctx.fixture.accounts;
    const { dataStore, multichainGmRouter } = ctx.fixture.contracts;
    const reentrancyTest = await deployContract("ReentrancyTest", []);
    const chainId = await ethers.provider.getNetwork().then((network) => network.chainId);

    const emptyRelayParams = getEmptyRelayParams(chainId);
    const reenterCalldata = multichainGmRouter.interface.encodeFunctionData("createDeposit", [
      emptyRelayParams,
      user0.address,
      chainId,
      getEmptyTransferRequests(),
      getEmptyDepositParams(),
    ]);
    await reentrancyTest.setReenterConfig(multichainGmRouter.address, reenterCalldata, 0, 1, false);

    await dataStore.setUint(keys.NATIVE_TOKEN_TRANSFER_GAS_LIMIT, bigNumberify(2_000_000));

    const amount = expandDecimals(1, 15);
    await multichainGmRouter.connect(user0).sendNativeToken(reentrancyTest.address, amount, { value: amount });

    await expectReentrancyGuard(reentrancyTest);
  },
  "MultichainOrderRouter.batch -> MultichainOrderRouter.updateOrder": async (ctx) => {
    const { user0 } = ctx.fixture.accounts;
    const { multichainOrderRouter, wnt } = ctx.fixture.contracts;
    const reentrancyTest = await deployContract("ReentrancyTest", []);

    const createOrderParams = getDefaultRelayOrderParams(ctx);
    const initialCollateralAmount = bigNumberify(createOrderParams.numbers.initialCollateralDeltaAmount);
    const executionFee = bigNumberify(createOrderParams.numbers.executionFee);
    const feeAmount = executionFee.add(RELAY_FEE_AMOUNT);
    const totalWntAmount = initialCollateralAmount.add(feeAmount).add(EXTERNAL_CALL_AMOUNT);
    const { relaySigner, chainId } = await setupMultichainRelay(ctx, user0, totalWntAmount);

    const emptyRelayParams = getEmptyRelayParams(chainId);
    const reenterCalldata = multichainOrderRouter.interface.encodeFunctionData("updateOrder", [
      emptyRelayParams,
      user0.address,
      chainId,
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
    await reentrancyTest.setReenterConfig(multichainOrderRouter.address, reenterCalldata, 0, 1, false);

    const externalCalls = getRelayReentrancyCalls(reentrancyTest, wnt.address, EXTERNAL_CALL_AMOUNT);
    const batchParams: any = {
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: wnt.address,
        feeAmount,
        feeSwapPath: [],
      },
      account: user0.address,
      createOrderParamsList: [createOrderParams],
      updateOrderParamsList: [],
      cancelOrderKeys: [],
      deadline: 9999999999,
      relayRouter: multichainOrderRouter,
      chainId,
      srcChainId: chainId,
      desChainId: chainId,
      gelatoRelayFeeToken: wnt.address,
      gelatoRelayFeeAmount: RELAY_FEE_AMOUNT,
      externalCalls,
    };

    await sendGelatoBatch(batchParams);

    await expectReentrancyGuard(reentrancyTest);
  },
  "MultichainOrderRouter.cancelOrder -> MultichainOrderRouter.updateOrder": async (ctx) => {
    const { user0 } = ctx.fixture.accounts;
    const { multichainOrderRouter, wnt } = ctx.fixture.contracts;
    const reentrancyTest = await deployContract("ReentrancyTest", []);

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

    const { relaySigner, chainId } = await setupMultichainRelay(ctx, user0, RELAY_FEE_AMOUNT.add(EXTERNAL_CALL_AMOUNT));

    const emptyRelayParams = getEmptyRelayParams(chainId);
    const reenterCalldata = multichainOrderRouter.interface.encodeFunctionData("updateOrder", [
      emptyRelayParams,
      user0.address,
      chainId,
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
    await reentrancyTest.setReenterConfig(multichainOrderRouter.address, reenterCalldata, 0, 1, false);

    await increaseTimeForCancellation(ctx.dataStore);

    const externalCalls = getRelayReentrancyCalls(reentrancyTest, wnt.address, EXTERNAL_CALL_AMOUNT);
    const cancelOrderParams: any = {
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: wnt.address,
        feeAmount: RELAY_FEE_AMOUNT,
        feeSwapPath: [],
      },
      key,
      account: user0.address,
      deadline: 9999999999,
      srcChainId: chainId,
      desChainId: chainId,
      relayRouter: multichainOrderRouter,
      chainId,
      gelatoRelayFeeToken: wnt.address,
      gelatoRelayFeeAmount: RELAY_FEE_AMOUNT,
      externalCalls,
    };

    await sendGelatoCancelOrder(cancelOrderParams);

    await expectReentrancyGuard(reentrancyTest);
  },
  "MultichainOrderRouter.createOrder -> MultichainOrderRouter.cancelOrder": async (ctx) => {
    const { user0 } = ctx.fixture.accounts;
    const { multichainOrderRouter, wnt } = ctx.fixture.contracts;
    const reentrancyTest = await deployContract("ReentrancyTest", []);

    const params = getDefaultRelayOrderParams(ctx);
    const initialCollateralAmount = bigNumberify(params.numbers.initialCollateralDeltaAmount);
    const executionFee = bigNumberify(params.numbers.executionFee);
    const feeAmount = executionFee.add(RELAY_FEE_AMOUNT);
    const totalWntAmount = initialCollateralAmount.add(feeAmount).add(EXTERNAL_CALL_AMOUNT);
    const { relaySigner, chainId } = await setupMultichainRelay(ctx, user0, totalWntAmount);

    const emptyRelayParams = getEmptyRelayParams(chainId);
    const reenterCalldata = multichainOrderRouter.interface.encodeFunctionData("cancelOrder", [
      emptyRelayParams,
      user0.address,
      chainId,
      ethers.constants.HashZero,
    ]);
    await reentrancyTest.setReenterConfig(multichainOrderRouter.address, reenterCalldata, 0, 1, false);

    const externalCalls = getRelayReentrancyCalls(reentrancyTest, wnt.address, EXTERNAL_CALL_AMOUNT);
    const createOrderParams: any = {
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: wnt.address,
        feeAmount,
        feeSwapPath: [],
      },
      account: user0.address,
      params,
      deadline: 9999999999,
      srcChainId: chainId,
      desChainId: chainId,
      relayRouter: multichainOrderRouter,
      chainId,
      gelatoRelayFeeToken: wnt.address,
      gelatoRelayFeeAmount: RELAY_FEE_AMOUNT,
      externalCalls,
    };

    await sendGelatoCreateOrder(createOrderParams);

    await expectReentrancyGuard(reentrancyTest);
  },
  "MultichainOrderRouter.registerCode -> MultichainOrderRouter.setTraderReferralCode": async (ctx) => {
    const { user0 } = ctx.fixture.accounts;
    const { multichainOrderRouter, wnt } = ctx.fixture.contracts;
    const reentrancyTest = await deployContract("ReentrancyTest", []);
    const { relaySigner, chainId } = await setupMultichainRelay(ctx, user0, RELAY_FEE_AMOUNT.add(EXTERNAL_CALL_AMOUNT));

    const referralCode = hashString("reentrancy-register-code");
    const reenterCode = hashString("reentrancy-set-code");

    const emptyRelayParams = getEmptyRelayParams(chainId);
    const reenterCalldata = multichainOrderRouter.interface.encodeFunctionData("setTraderReferralCode", [
      emptyRelayParams,
      user0.address,
      chainId,
      reenterCode,
    ]);
    await reentrancyTest.setReenterConfig(multichainOrderRouter.address, reenterCalldata, 0, 1, false);

    const externalCalls = getRelayReentrancyCalls(reentrancyTest, wnt.address, EXTERNAL_CALL_AMOUNT);
    const registerCodeParams: any = {
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: wnt.address,
        feeAmount: RELAY_FEE_AMOUNT,
        feeSwapPath: [],
      },
      account: user0.address,
      referralCode,
      deadline: 9999999999,
      srcChainId: chainId,
      desChainId: chainId,
      relayRouter: multichainOrderRouter,
      chainId,
      gelatoRelayFeeToken: wnt.address,
      gelatoRelayFeeAmount: RELAY_FEE_AMOUNT,
      externalCalls,
    };

    await sendRegisterCode(registerCodeParams);

    await expectReentrancyGuard(reentrancyTest);
  },
  "MultichainOrderRouter.sendNativeToken -> MultichainOrderRouter.cancelOrder": async (ctx) => {
    const { user0 } = ctx.fixture.accounts;
    const { dataStore, multichainOrderRouter } = ctx.fixture.contracts;
    const reentrancyTest = await deployContract("ReentrancyTest", []);
    const chainId = await ethers.provider.getNetwork().then((network) => network.chainId);

    const emptyRelayParams = getEmptyRelayParams(chainId);
    const reenterCalldata = multichainOrderRouter.interface.encodeFunctionData("cancelOrder", [
      emptyRelayParams,
      user0.address,
      chainId,
      ethers.constants.HashZero,
    ]);
    await reentrancyTest.setReenterConfig(multichainOrderRouter.address, reenterCalldata, 0, 1, false);

    await dataStore.setUint(keys.NATIVE_TOKEN_TRANSFER_GAS_LIMIT, bigNumberify(2_000_000));

    const amount = expandDecimals(1, 15);
    await multichainOrderRouter.connect(user0).sendNativeToken(reentrancyTest.address, amount, { value: amount });

    await expectReentrancyGuard(reentrancyTest);
  },
  "MultichainOrderRouter.setTraderReferralCode -> MultichainOrderRouter.registerCode": async (ctx) => {
    const { user0 } = ctx.fixture.accounts;
    const { multichainOrderRouter, wnt } = ctx.fixture.contracts;
    const reentrancyTest = await deployContract("ReentrancyTest", []);
    const { relaySigner, chainId } = await setupMultichainRelay(ctx, user0, RELAY_FEE_AMOUNT.add(EXTERNAL_CALL_AMOUNT));

    const referralCode = hashString("reentrancy-set-referral-code");
    const reenterCode = hashString("reentrancy-register-code");

    const emptyRelayParams = getEmptyRelayParams(chainId);
    const reenterCalldata = multichainOrderRouter.interface.encodeFunctionData("registerCode", [
      emptyRelayParams,
      user0.address,
      chainId,
      reenterCode,
    ]);
    await reentrancyTest.setReenterConfig(multichainOrderRouter.address, reenterCalldata, 0, 1, false);

    const externalCalls = getRelayReentrancyCalls(reentrancyTest, wnt.address, EXTERNAL_CALL_AMOUNT);
    const setReferralParams: any = {
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: wnt.address,
        feeAmount: RELAY_FEE_AMOUNT,
        feeSwapPath: [],
      },
      account: user0.address,
      referralCode,
      deadline: 9999999999,
      srcChainId: chainId,
      desChainId: chainId,
      relayRouter: multichainOrderRouter,
      chainId,
      gelatoRelayFeeToken: wnt.address,
      gelatoRelayFeeAmount: RELAY_FEE_AMOUNT,
      externalCalls,
    };

    await sendSetTraderReferralCode(setReferralParams);

    await expectReentrancyGuard(reentrancyTest);
  },
  "MultichainOrderRouter.updateOrder -> MultichainOrderRouter.cancelOrder": async (ctx) => {
    const { user0 } = ctx.fixture.accounts;
    const { multichainOrderRouter, wnt } = ctx.fixture.contracts;
    const reentrancyTest = await deployContract("ReentrancyTest", []);

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

    const { relaySigner, chainId } = await setupMultichainRelay(ctx, user0, RELAY_FEE_AMOUNT.add(EXTERNAL_CALL_AMOUNT));

    const emptyRelayParams = getEmptyRelayParams(chainId);
    const reenterCalldata = multichainOrderRouter.interface.encodeFunctionData("cancelOrder", [
      emptyRelayParams,
      user0.address,
      chainId,
      ethers.constants.HashZero,
    ]);
    await reentrancyTest.setReenterConfig(multichainOrderRouter.address, reenterCalldata, 0, 1, false);

    const externalCalls = getRelayReentrancyCalls(reentrancyTest, wnt.address, EXTERNAL_CALL_AMOUNT);
    const updateOrderParams: any = {
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: wnt.address,
        feeAmount: RELAY_FEE_AMOUNT,
        feeSwapPath: [],
      },
      account: user0.address,
      params: {
        key,
        sizeDeltaUsd: decimalToFloat(150 * 1000),
        acceptablePrice: expandDecimals(5002, 12),
        triggerPrice: expandDecimals(5001, 12),
        minOutputAmount: 0,
        validFromTime: 0,
        autoCancel: false,
        executionFeeIncrease: 0,
      },
      deadline: 9999999999,
      srcChainId: chainId,
      desChainId: chainId,
      relayRouter: multichainOrderRouter,
      chainId,
      gelatoRelayFeeToken: wnt.address,
      gelatoRelayFeeAmount: RELAY_FEE_AMOUNT,
      externalCalls,
    };

    await sendGelatoUpdateOrder(updateOrderParams);

    await expectReentrancyGuard(reentrancyTest);
  },
  "SubaccountGelatoRelayRouter.batch -> SubaccountGelatoRelayRouter.updateOrder": async (ctx) => {
    const { user0, user1, wallet } = ctx.fixture.accounts;
    const { dataStore, subaccountGelatoRelayRouter, router, wnt } = ctx.fixture.contracts;
    const reentrancyToken = await deployReentrantToken();
    const { relaySigner, chainId } = await getRelaySignerAndChainId();

    await dataStore.setAddress(keys.HOLDING_ADDRESS, wallet.address);
    await dataStore.setAddress(keys.WNT, reentrancyToken.address);
    await dataStore.setUint(keys.tokenTransferGasLimit(reentrancyToken.address), 2_000_000);

    await enableSubaccount(ctx, user1, user0);

    const executionFee = EXECUTION_FEE;
    const feeAmount = executionFee.add(RELAY_FEE_AMOUNT);
    const params = getSubaccountOrderParams(ctx, user1.address, {
      numbers: { executionFee },
    });
    const initialCollateralAmount = bigNumberify(params.numbers.initialCollateralDeltaAmount);
    const totalFeeAmount = feeAmount;

    await reentrancyToken.mint(user1.address, totalFeeAmount);
    await reentrancyToken.connect(user1).approve(router.address, totalFeeAmount);
    await wnt.connect(user1).deposit({ value: initialCollateralAmount });
    await wnt.connect(user1).approve(router.address, initialCollateralAmount);

    const emptyRelayParams = getEmptyRelayParams(chainId);
    const reenterCalldata = subaccountGelatoRelayRouter.interface.encodeFunctionData("updateOrder", [
      emptyRelayParams,
      getEmptySubaccountApproval(),
      user1.address,
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
    await reentrancyToken.setReenterConfig(subaccountGelatoRelayRouter.address, reenterCalldata, 0, 1, false);

    const batchParams: any = {
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: reentrancyToken.address,
        feeAmount,
        feeSwapPath: [],
      },
      account: user1.address,
      subaccount: user0.address,
      subaccountApproval: getEmptySubaccountApproval(),
      subaccountApprovalSigner: user1,
      createOrderParamsList: [params],
      updateOrderParamsList: [],
      cancelOrderKeys: [],
      deadline: 9999999999,
      relayRouter: subaccountGelatoRelayRouter,
      chainId,
      desChainId: chainId,
      gelatoRelayFeeToken: reentrancyToken.address,
      gelatoRelayFeeAmount: RELAY_FEE_AMOUNT,
    };

    await sendSubaccountBatch(batchParams);

    await expectTokenReentrancyGuard(reentrancyToken);
  },
  "SubaccountGelatoRelayRouter.cancelOrder -> SubaccountGelatoRelayRouter.updateOrder": async (ctx) => {
    const { user0, user1, wallet } = ctx.fixture.accounts;
    const { dataStore, subaccountGelatoRelayRouter, router, wnt } = ctx.fixture.contracts;
    const reentrancyToken = await deployReentrantToken();
    const { relaySigner, chainId } = await getRelaySignerAndChainId();

    await dataStore.setAddress(keys.HOLDING_ADDRESS, wallet.address);
    await dataStore.setAddress(keys.WNT, reentrancyToken.address);
    await dataStore.setUint(keys.tokenTransferGasLimit(reentrancyToken.address), 2_000_000);

    await enableSubaccount(ctx, user1, user0);

    const executionFee = EXECUTION_FEE;
    const feeAmount = executionFee.add(RELAY_FEE_AMOUNT);
    const params = getSubaccountOrderParams(ctx, user1.address, {
      numbers: { executionFee },
    });
    const initialCollateralAmount = bigNumberify(params.numbers.initialCollateralDeltaAmount);
    const totalFeeAmount = feeAmount.mul(2);

    await reentrancyToken.mint(user1.address, totalFeeAmount);
    await reentrancyToken.connect(user1).approve(router.address, totalFeeAmount);
    await wnt.connect(user1).deposit({ value: initialCollateralAmount });
    await wnt.connect(user1).approve(router.address, initialCollateralAmount);

    await sendSubaccountCreateOrder({
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: reentrancyToken.address,
        feeAmount,
        feeSwapPath: [],
      },
      account: user1.address,
      subaccount: user0.address,
      subaccountApproval: getEmptySubaccountApproval(),
      subaccountApprovalSigner: user1,
      params,
      deadline: 9999999999,
      relayRouter: subaccountGelatoRelayRouter,
      chainId,
      desChainId: chainId,
      gelatoRelayFeeToken: reentrancyToken.address,
      gelatoRelayFeeAmount: RELAY_FEE_AMOUNT,
    });

    const orderKeys = await getOrderKeys(ctx.dataStore, 0, 1);
    const key = orderKeys[0];

    const emptyRelayParams = getEmptyRelayParams(chainId);
    const reenterCalldata = subaccountGelatoRelayRouter.interface.encodeFunctionData("updateOrder", [
      emptyRelayParams,
      getEmptySubaccountApproval(),
      user1.address,
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
    await reentrancyToken.setReenterConfig(subaccountGelatoRelayRouter.address, reenterCalldata, 0, 1, false);

    await increaseTimeForCancellation(ctx.dataStore);

    await sendSubaccountCancelOrder({
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: reentrancyToken.address,
        feeAmount,
        feeSwapPath: [],
      },
      account: user1.address,
      subaccount: user0.address,
      subaccountApproval: getEmptySubaccountApproval(),
      subaccountApprovalSigner: user1,
      key,
      deadline: 9999999999,
      relayRouter: subaccountGelatoRelayRouter,
      chainId,
      desChainId: chainId,
      gelatoRelayFeeToken: reentrancyToken.address,
      gelatoRelayFeeAmount: RELAY_FEE_AMOUNT,
    });

    await expectTokenReentrancyGuard(reentrancyToken);
  },
  "SubaccountGelatoRelayRouter.createOrder -> SubaccountGelatoRelayRouter.cancelOrder": async (ctx) => {
    const { user0, user1, wallet } = ctx.fixture.accounts;
    const { dataStore, subaccountGelatoRelayRouter, router, wnt } = ctx.fixture.contracts;
    const reentrancyToken = await deployReentrantToken();
    const { relaySigner, chainId } = await getRelaySignerAndChainId();

    await dataStore.setAddress(keys.HOLDING_ADDRESS, wallet.address);
    await dataStore.setAddress(keys.WNT, reentrancyToken.address);
    await dataStore.setUint(keys.tokenTransferGasLimit(reentrancyToken.address), 2_000_000);

    await enableSubaccount(ctx, user1, user0);

    const executionFee = EXECUTION_FEE;
    const feeAmount = executionFee.add(RELAY_FEE_AMOUNT);
    const params = getSubaccountOrderParams(ctx, user1.address, {
      numbers: { executionFee },
    });
    const initialCollateralAmount = bigNumberify(params.numbers.initialCollateralDeltaAmount);
    const totalFeeAmount = feeAmount;

    await reentrancyToken.mint(user1.address, totalFeeAmount);
    await reentrancyToken.connect(user1).approve(router.address, totalFeeAmount);
    await wnt.connect(user1).deposit({ value: initialCollateralAmount });
    await wnt.connect(user1).approve(router.address, initialCollateralAmount);

    const emptyRelayParams = getEmptyRelayParams(chainId);
    const reenterCalldata = subaccountGelatoRelayRouter.interface.encodeFunctionData("cancelOrder", [
      emptyRelayParams,
      getEmptySubaccountApproval(),
      user1.address,
      user0.address,
      ethers.constants.HashZero,
    ]);
    await reentrancyToken.setReenterConfig(subaccountGelatoRelayRouter.address, reenterCalldata, 0, 1, false);

    await sendSubaccountCreateOrder({
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: reentrancyToken.address,
        feeAmount,
        feeSwapPath: [],
      },
      account: user1.address,
      subaccount: user0.address,
      subaccountApproval: getEmptySubaccountApproval(),
      subaccountApprovalSigner: user1,
      params,
      deadline: 9999999999,
      relayRouter: subaccountGelatoRelayRouter,
      chainId,
      desChainId: chainId,
      gelatoRelayFeeToken: reentrancyToken.address,
      gelatoRelayFeeAmount: RELAY_FEE_AMOUNT,
    });

    await expectTokenReentrancyGuard(reentrancyToken);
  },
  "SubaccountGelatoRelayRouter.removeSubaccount -> SubaccountGelatoRelayRouter.updateOrder": async (ctx) => {
    const { user0, user1 } = ctx.fixture.accounts;
    const { subaccountGelatoRelayRouter, router, wnt } = ctx.fixture.contracts;
    const reentrancyTest = await deployContract("ReentrancyTest", []);
    const { relaySigner, chainId } = await getRelaySignerAndChainId();

    await enableSubaccount(ctx, user1, user0);

    await wnt.connect(user1).deposit({ value: expandDecimals(1, 18) });
    await wnt.connect(user1).approve(router.address, expandDecimals(1, 18));

    const emptyRelayParams = getEmptyRelayParams(chainId);
    const reenterCalldata = subaccountGelatoRelayRouter.interface.encodeFunctionData("updateOrder", [
      emptyRelayParams,
      getEmptySubaccountApproval(),
      user1.address,
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
    await reentrancyTest.setReenterConfig(subaccountGelatoRelayRouter.address, reenterCalldata, 0, 1, false);

    const externalCalls = getRelayReentrancyCalls(reentrancyTest, wnt.address, EXTERNAL_CALL_AMOUNT);
    await sendSubaccountRemoveSubaccount({
      sender: relaySigner,
      signer: user1,
      feeParams: {
        feeToken: wnt.address,
        feeAmount: RELAY_FEE_AMOUNT,
        feeSwapPath: [],
      },
      externalCalls,
      subaccount: user0.address,
      chainId,
      account: user1.address,
      deadline: 9999999999,
      relayRouter: subaccountGelatoRelayRouter,
      desChainId: chainId,
      gelatoRelayFeeToken: wnt.address,
      gelatoRelayFeeAmount: RELAY_FEE_AMOUNT,
    });

    await expectReentrancyGuard(reentrancyTest);
  },
  "SubaccountGelatoRelayRouter.sendNativeToken -> SubaccountGelatoRelayRouter.cancelOrder": async (ctx) => {
    const { user0 } = ctx.fixture.accounts;
    const { dataStore, subaccountGelatoRelayRouter } = ctx.fixture.contracts;
    const reentrancyTest = await deployContract("ReentrancyTest", []);
    const chainId = await ethers.provider.getNetwork().then((network) => network.chainId);

    const emptyRelayParams = getEmptyRelayParams(chainId);
    const reenterCalldata = subaccountGelatoRelayRouter.interface.encodeFunctionData("cancelOrder", [
      emptyRelayParams,
      getEmptySubaccountApproval(),
      user0.address,
      user0.address,
      ethers.constants.HashZero,
    ]);
    await reentrancyTest.setReenterConfig(subaccountGelatoRelayRouter.address, reenterCalldata, 0, 1, false);

    await dataStore.setUint(keys.NATIVE_TOKEN_TRANSFER_GAS_LIMIT, bigNumberify(2_000_000));

    const amount = expandDecimals(1, 15);
    await subaccountGelatoRelayRouter.connect(user0).sendNativeToken(reentrancyTest.address, amount, { value: amount });

    await expectReentrancyGuard(reentrancyTest);
  },
  "SubaccountGelatoRelayRouter.updateOrder -> SubaccountGelatoRelayRouter.cancelOrder": async (ctx) => {
    const { user0, user1, wallet } = ctx.fixture.accounts;
    const { dataStore, subaccountGelatoRelayRouter, router, wnt } = ctx.fixture.contracts;
    const reentrancyToken = await deployReentrantToken();
    const { relaySigner, chainId } = await getRelaySignerAndChainId();

    await dataStore.setAddress(keys.HOLDING_ADDRESS, wallet.address);
    await dataStore.setAddress(keys.WNT, reentrancyToken.address);
    await dataStore.setUint(keys.tokenTransferGasLimit(reentrancyToken.address), 2_000_000);

    await enableSubaccount(ctx, user1, user0);

    const executionFee = EXECUTION_FEE;
    const feeAmount = executionFee.add(RELAY_FEE_AMOUNT);
    const params = getSubaccountOrderParams(ctx, user1.address, {
      numbers: { executionFee },
    });
    const initialCollateralAmount = bigNumberify(params.numbers.initialCollateralDeltaAmount);
    const totalFeeAmount = feeAmount.mul(2);

    await reentrancyToken.mint(user1.address, totalFeeAmount);
    await reentrancyToken.connect(user1).approve(router.address, totalFeeAmount);
    await wnt.connect(user1).deposit({ value: initialCollateralAmount });
    await wnt.connect(user1).approve(router.address, initialCollateralAmount);

    await sendSubaccountCreateOrder({
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: reentrancyToken.address,
        feeAmount,
        feeSwapPath: [],
      },
      account: user1.address,
      subaccount: user0.address,
      subaccountApproval: getEmptySubaccountApproval(),
      subaccountApprovalSigner: user1,
      params,
      deadline: 9999999999,
      relayRouter: subaccountGelatoRelayRouter,
      chainId,
      desChainId: chainId,
      gelatoRelayFeeToken: reentrancyToken.address,
      gelatoRelayFeeAmount: RELAY_FEE_AMOUNT,
    });

    const orderKeys = await getOrderKeys(ctx.dataStore, 0, 1);
    const key = orderKeys[0];

    const emptyRelayParams = getEmptyRelayParams(chainId);
    const reenterCalldata = subaccountGelatoRelayRouter.interface.encodeFunctionData("cancelOrder", [
      emptyRelayParams,
      getEmptySubaccountApproval(),
      user1.address,
      user0.address,
      ethers.constants.HashZero,
    ]);
    await reentrancyToken.setReenterConfig(subaccountGelatoRelayRouter.address, reenterCalldata, 0, 1, false);

    await sendSubaccountUpdateOrder({
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: reentrancyToken.address,
        feeAmount,
        feeSwapPath: [],
      },
      account: user1.address,
      subaccount: user0.address,
      subaccountApproval: getEmptySubaccountApproval(),
      subaccountApprovalSigner: user1,
      params: {
        key,
        sizeDeltaUsd: decimalToFloat(150 * 1000),
        acceptablePrice: expandDecimals(5002, 12),
        triggerPrice: expandDecimals(5001, 12),
        minOutputAmount: 0,
        validFromTime: 0,
        autoCancel: false,
        executionFeeIncrease: 0,
      },
      deadline: 9999999999,
      relayRouter: subaccountGelatoRelayRouter,
      chainId,
      desChainId: chainId,
      gelatoRelayFeeToken: reentrancyToken.address,
      gelatoRelayFeeAmount: RELAY_FEE_AMOUNT,
    });

    await expectTokenReentrancyGuard(reentrancyToken);
  },
  "SubaccountRouter.sendNativeToken -> SubaccountRouter.removeSubaccount": async (ctx) => {
    const { user0 } = ctx.fixture.accounts;
    const { dataStore, subaccountRouter } = ctx.fixture.contracts;
    const reentrancyTest = await deployContract("ReentrancyTest", []);

    const reenterCalldata = subaccountRouter.interface.encodeFunctionData("removeSubaccount", [user0.address]);
    await reentrancyTest.setReenterConfig(subaccountRouter.address, reenterCalldata, 0, 1, false);

    await dataStore.setUint(keys.NATIVE_TOKEN_TRANSFER_GAS_LIMIT, bigNumberify(2_000_000));

    const amount = expandDecimals(1, 15);
    await subaccountRouter.connect(user0).sendNativeToken(reentrancyTest.address, amount, { value: amount });

    await expectReentrancyGuard(reentrancyTest);
  },
  "MultichainReader.lzReceive -> MultichainReader.sendReadRequests": async (ctx) => {
    const { config, multichainReader, mockEndpointV2, roleStore } = ctx.fixture.contracts;
    const { user0 } = ctx.fixture.accounts;
    const reentrancyOriginator = await deployContract("ReentrantMultichainReaderOriginator", [
      multichainReader.address,
    ]);
    const mockLzReadResponse = await deployContract("MockLzReadResponse", []);

    const channelId = 1001;
    const targetChainEid = 1000;

    await mockEndpointV2.setDestLzEndpoint(multichainReader.address, mockEndpointV2.address);
    await mockEndpointV2.setReadChannelId(channelId);

    await config.setBool(
      keys.MULTICHAIN_AUTHORIZED_ORIGINATORS,
      encodeData(["address"], [reentrancyOriginator.address]),
      "true"
    );
    await config.setUint(keys.MULTICHAIN_READ_CHANNEL, "0x", channelId);
    await config.setBytes32(
      keys.MULTICHAIN_PEERS,
      encodeData(["uint256"], [channelId]),
      ethers.utils.hexZeroPad(multichainReader.address, 32)
    );

    const currentChainEid = await multichainReader.currentChainEid();
    await config.setUint(keys.MULTICHAIN_CONFIRMATIONS, encodeData(["uint256"], [targetChainEid]), 1);
    await config.setUint(keys.MULTICHAIN_CONFIRMATIONS, encodeData(["uint256"], [currentChainEid]), 1);

    await grantRole(roleStore, reentrancyOriginator.address, "CONTROLLER");

    const functionSignature = new ethers.utils.Interface(["function getUint(bytes32) external view returns (uint256)"]);
    const callData = functionSignature.encodeFunctionData("getUint", [
      keys.withdrawableBuybackTokenAmountKey(user0.address),
    ]);
    const readRequestInputs = [
      {
        targetChainEid,
        target: mockLzReadResponse.address,
        callData,
      },
    ];
    const extraOptionsInputs = {
      gasLimit: 500000,
      returnDataSize: 40,
      msgValue: 0,
    };

    const encodedReadRequestInputs = ethers.utils.defaultAbiCoder.encode(
      ["tuple(uint32 targetChainEid,address target,bytes callData)[]"],
      [readRequestInputs]
    );
    await reentrancyOriginator.setReenterConfig(encodedReadRequestInputs, extraOptionsInputs, 1);

    const nativeFee = await multichainReader.quoteReadFee(readRequestInputs, extraOptionsInputs);
    await reentrancyOriginator.callSendReadRequests(readRequestInputs, extraOptionsInputs, {
      value: nativeFee.nativeFee,
    });

    expect(await reentrancyOriginator.reenterDepth()).eq(1);
    expect(await reentrancyOriginator.lastReenterSuccess()).eq(false);

    const lastResult = await reentrancyOriginator.lastReenterResult();
    const parsed = parseError(lastResult, false);
    if (parsed) {
      expect(parsed.name).eq("Error");
      expect(parsed.args?.[0]).eq("LayerZeroMock: no receive reentrancy");
    } else if (lastResult === "0x") {
      expect(lastResult).eq("0x");
    } else {
      const lzSendReentrancySig = ethers.utils.id("LZ_SendReentrancy()").slice(0, 10);
      expect(lastResult.slice(0, 10)).eq(lzSendReentrancySig);
    }
  },
  "MultichainSubaccountRouter.batch -> MultichainSubaccountRouter.updateOrder": async (ctx) => {
    const { user0, user1, wallet } = ctx.fixture.accounts;
    const { dataStore, multichainSubaccountRouter } = ctx.fixture.contracts;
    const reentrancyToken = await deployReentrantToken();

    await dataStore.setAddress(keys.HOLDING_ADDRESS, wallet.address);
    await dataStore.setAddress(keys.WNT, reentrancyToken.address);
    await dataStore.setUint(keys.tokenTransferGasLimit(reentrancyToken.address), 2_000_000);

    await enableSubaccount(ctx, user1, user0);

    const { relaySigner, chainId } = await setupMultichainRelay(ctx, user1, 0);
    const executionFee = EXECUTION_FEE;
    const feeAmount = executionFee.add(RELAY_FEE_AMOUNT);

    await seedMultichainBalanceForToken(ctx, user1, reentrancyToken, feeAmount);

    const params = getSubaccountOrderParams(ctx, user1.address, {
      numbers: { executionFee },
    });
    const initialCollateralAmount = bigNumberify(params.numbers.initialCollateralDeltaAmount);
    const initialCollateralToken = await contractAt("MintableToken", params.addresses.initialCollateralToken);
    await dataStore.setUint(keys.tokenTransferGasLimit(initialCollateralToken.address), 2_000_000);
    await seedMultichainBalanceForToken(ctx, user1, initialCollateralToken, initialCollateralAmount);

    const emptyRelayParams = getEmptyRelayParams(chainId);
    const reenterCalldata = multichainSubaccountRouter.interface.encodeFunctionData("updateOrder", [
      emptyRelayParams,
      getEmptySubaccountApproval(),
      user1.address,
      chainId,
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
    await reentrancyToken.setReenterConfig(multichainSubaccountRouter.address, reenterCalldata, 0, 1, false);

    const batchParams: any = {
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: reentrancyToken.address,
        feeAmount,
        feeSwapPath: [],
      },
      account: user1.address,
      subaccount: user0.address,
      subaccountApproval: getEmptySubaccountApproval(),
      subaccountApprovalSigner: user1,
      createOrderParamsList: [params],
      updateOrderParamsList: [],
      cancelOrderKeys: [],
      deadline: 9999999999,
      relayRouter: multichainSubaccountRouter,
      chainId,
      srcChainId: chainId,
      desChainId: chainId,
      gelatoRelayFeeToken: reentrancyToken.address,
      gelatoRelayFeeAmount: RELAY_FEE_AMOUNT,
    };

    await sendSubaccountBatch(batchParams);

    await expectTokenReentrancyGuard(reentrancyToken);
  },
  "MultichainSubaccountRouter.cancelOrder -> MultichainSubaccountRouter.createOrder": async (ctx) => {
    const { user0, user1, wallet } = ctx.fixture.accounts;
    const { dataStore, multichainSubaccountRouter } = ctx.fixture.contracts;
    const reentrancyToken = await deployReentrantToken();

    await dataStore.setAddress(keys.HOLDING_ADDRESS, wallet.address);
    await dataStore.setAddress(keys.WNT, reentrancyToken.address);
    await dataStore.setUint(keys.tokenTransferGasLimit(reentrancyToken.address), 2_000_000);

    await enableSubaccount(ctx, user1, user0);

    const { relaySigner, chainId } = await setupMultichainRelay(ctx, user1, 0);
    const executionFee = EXECUTION_FEE;
    const params = getSubaccountOrderParams(ctx, user1.address, {
      numbers: { executionFee },
    });
    const initialCollateralAmount = bigNumberify(params.numbers.initialCollateralDeltaAmount);
    const initialCollateralToken = await contractAt("MintableToken", params.addresses.initialCollateralToken);
    const totalFeeAmount = executionFee.mul(2).add(RELAY_FEE_AMOUNT.mul(3));

    await dataStore.setUint(keys.tokenTransferGasLimit(initialCollateralToken.address), 2_000_000);
    await seedMultichainBalanceForToken(ctx, user1, initialCollateralToken, initialCollateralAmount.mul(2));
    await seedMultichainBalanceForToken(ctx, user1, reentrancyToken, totalFeeAmount);

    const createOrderParams: any = {
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: reentrancyToken.address,
        feeAmount: executionFee.add(RELAY_FEE_AMOUNT),
        feeSwapPath: [],
      },
      account: user1.address,
      subaccount: user0.address,
      subaccountApproval: getEmptySubaccountApproval(),
      subaccountApprovalSigner: user1,
      params,
      deadline: 9999999999,
      relayRouter: multichainSubaccountRouter,
      chainId,
      srcChainId: chainId,
      desChainId: chainId,
      gelatoRelayFeeToken: reentrancyToken.address,
      gelatoRelayFeeAmount: RELAY_FEE_AMOUNT,
    };

    await sendSubaccountCreateOrder(createOrderParams);

    const orderKeys = await getOrderKeys(ctx.dataStore, 0, 1);
    const key = orderKeys[0];

    const emptyRelayParams = getEmptyRelayParams(chainId);
    const reenterCalldata = multichainSubaccountRouter.interface.encodeFunctionData("createOrder", [
      emptyRelayParams,
      getEmptySubaccountApproval(),
      user1.address,
      chainId,
      user0.address,
      getSubaccountOrderParams(ctx, user1.address),
    ]);
    await reentrancyToken.setReenterConfig(multichainSubaccountRouter.address, reenterCalldata, 0, 1, false);

    await increaseTimeForCancellation(ctx.dataStore);

    const cancelOrderParams: any = {
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: reentrancyToken.address,
        feeAmount: RELAY_FEE_AMOUNT,
        feeSwapPath: [],
      },
      subaccount: user0.address,
      subaccountApproval: getEmptySubaccountApproval(),
      subaccountApprovalSigner: user1,
      chainId,
      account: user1.address,
      key,
      deadline: 9999999999,
      srcChainId: chainId,
      desChainId: chainId,
      relayRouter: multichainSubaccountRouter,
      gelatoRelayFeeToken: reentrancyToken.address,
      gelatoRelayFeeAmount: RELAY_FEE_AMOUNT,
    };

    await sendSubaccountCancelOrder(cancelOrderParams);

    await expectTokenReentrancyGuard(reentrancyToken);
  },
  "MultichainSubaccountRouter.createOrder -> MultichainSubaccountRouter.cancelOrder": async (ctx) => {
    const { user0, user1, wallet } = ctx.fixture.accounts;
    const { dataStore, multichainSubaccountRouter } = ctx.fixture.contracts;
    const reentrancyToken = await deployReentrantToken();

    await dataStore.setAddress(keys.HOLDING_ADDRESS, wallet.address);
    await dataStore.setAddress(keys.WNT, reentrancyToken.address);
    await dataStore.setUint(keys.tokenTransferGasLimit(reentrancyToken.address), 2_000_000);

    await enableSubaccount(ctx, user1, user0);

    const { relaySigner, chainId } = await setupMultichainRelay(ctx, user1, 0);
    const executionFee = EXECUTION_FEE;
    const feeAmount = executionFee.add(RELAY_FEE_AMOUNT);

    await seedMultichainBalanceForToken(ctx, user1, reentrancyToken, feeAmount);

    const params = getSubaccountOrderParams(ctx, user1.address, {
      numbers: { executionFee },
    });
    const initialCollateralAmount = bigNumberify(params.numbers.initialCollateralDeltaAmount);
    const initialCollateralToken = await contractAt("MintableToken", params.addresses.initialCollateralToken);
    await dataStore.setUint(keys.tokenTransferGasLimit(initialCollateralToken.address), 2_000_000);
    await seedMultichainBalanceForToken(ctx, user1, initialCollateralToken, initialCollateralAmount);

    const emptyRelayParams = getEmptyRelayParams(chainId);
    const reenterCalldata = multichainSubaccountRouter.interface.encodeFunctionData("cancelOrder", [
      emptyRelayParams,
      getEmptySubaccountApproval(),
      user1.address,
      chainId,
      user0.address,
      ethers.constants.HashZero,
    ]);
    await reentrancyToken.setReenterConfig(multichainSubaccountRouter.address, reenterCalldata, 0, 1, false);

    const createOrderParams: any = {
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: reentrancyToken.address,
        feeAmount,
        feeSwapPath: [],
      },
      account: user1.address,
      subaccount: user0.address,
      subaccountApproval: getEmptySubaccountApproval(),
      subaccountApprovalSigner: user1,
      params,
      deadline: 9999999999,
      relayRouter: multichainSubaccountRouter,
      chainId,
      srcChainId: chainId,
      desChainId: chainId,
      gelatoRelayFeeToken: reentrancyToken.address,
      gelatoRelayFeeAmount: RELAY_FEE_AMOUNT,
    };

    await sendSubaccountCreateOrder(createOrderParams);

    await expectTokenReentrancyGuard(reentrancyToken);
  },
  "MultichainSubaccountRouter.removeSubaccount -> MultichainSubaccountRouter.updateOrder": async (ctx) => {
    const { user0, user1 } = ctx.fixture.accounts;
    const { multichainSubaccountRouter, wnt } = ctx.fixture.contracts;
    const reentrancyTest = await deployContract("ReentrancyTest", []);

    await enableSubaccount(ctx, user1, user0);

    const { relaySigner, chainId } = await setupMultichainRelay(ctx, user1, RELAY_FEE_AMOUNT.add(EXTERNAL_CALL_AMOUNT));

    const emptyRelayParams = getEmptyRelayParams(chainId);
    const reenterCalldata = multichainSubaccountRouter.interface.encodeFunctionData("updateOrder", [
      emptyRelayParams,
      getEmptySubaccountApproval(),
      user1.address,
      chainId,
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
    await reentrancyTest.setReenterConfig(multichainSubaccountRouter.address, reenterCalldata, 0, 1, false);

    const externalCalls = getRelayReentrancyCalls(reentrancyTest, wnt.address, EXTERNAL_CALL_AMOUNT);
    const removeSubaccountParams: any = {
      sender: relaySigner,
      signer: user1,
      feeParams: {
        feeToken: wnt.address,
        feeAmount: RELAY_FEE_AMOUNT,
        feeSwapPath: [],
      },
      externalCalls,
      subaccount: user0.address,
      chainId,
      account: user1.address,
      deadline: 9999999999,
      srcChainId: chainId,
      desChainId: chainId,
      relayRouter: multichainSubaccountRouter,
      gelatoRelayFeeToken: wnt.address,
      gelatoRelayFeeAmount: RELAY_FEE_AMOUNT,
    };

    await sendSubaccountRemoveSubaccount(removeSubaccountParams);

    await expectReentrancyGuard(reentrancyTest);
  },
  "MultichainSubaccountRouter.sendNativeToken -> MultichainSubaccountRouter.cancelOrder": async (ctx) => {
    const { user0 } = ctx.fixture.accounts;
    const { dataStore, multichainSubaccountRouter } = ctx.fixture.contracts;
    const reentrancyTest = await deployContract("ReentrancyTest", []);
    const chainId = await ethers.provider.getNetwork().then((network) => network.chainId);

    const emptyRelayParams = getEmptyRelayParams(chainId);
    const reenterCalldata = multichainSubaccountRouter.interface.encodeFunctionData("cancelOrder", [
      emptyRelayParams,
      getEmptySubaccountApproval(),
      user0.address,
      chainId,
      user0.address,
      ethers.constants.HashZero,
    ]);
    await reentrancyTest.setReenterConfig(multichainSubaccountRouter.address, reenterCalldata, 0, 1, false);

    await dataStore.setUint(keys.NATIVE_TOKEN_TRANSFER_GAS_LIMIT, bigNumberify(2_000_000));

    const amount = expandDecimals(1, 15);
    await multichainSubaccountRouter.connect(user0).sendNativeToken(reentrancyTest.address, amount, { value: amount });

    await expectReentrancyGuard(reentrancyTest);
  },
  "MultichainSubaccountRouter.updateOrder -> MultichainSubaccountRouter.cancelOrder": async (ctx) => {
    const { user0, user1, wallet } = ctx.fixture.accounts;
    const { dataStore, multichainSubaccountRouter } = ctx.fixture.contracts;
    const reentrancyToken = await deployReentrantToken();

    await dataStore.setAddress(keys.HOLDING_ADDRESS, wallet.address);
    await dataStore.setAddress(keys.WNT, reentrancyToken.address);
    await dataStore.setUint(keys.tokenTransferGasLimit(reentrancyToken.address), 2_000_000);

    await enableSubaccount(ctx, user1, user0);

    const { relaySigner, chainId } = await setupMultichainRelay(ctx, user1, 0);
    const executionFee = EXECUTION_FEE;
    const params = getSubaccountOrderParams(ctx, user1.address, {
      numbers: { executionFee },
    });
    const initialCollateralAmount = bigNumberify(params.numbers.initialCollateralDeltaAmount);
    const initialCollateralToken = await contractAt("MintableToken", params.addresses.initialCollateralToken);
    const totalFeeAmount = executionFee.add(RELAY_FEE_AMOUNT.mul(2));

    await dataStore.setUint(keys.tokenTransferGasLimit(initialCollateralToken.address), 2_000_000);
    await seedMultichainBalanceForToken(ctx, user1, initialCollateralToken, initialCollateralAmount);
    await seedMultichainBalanceForToken(ctx, user1, reentrancyToken, totalFeeAmount);

    const createOrderParams: any = {
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: reentrancyToken.address,
        feeAmount: executionFee.add(RELAY_FEE_AMOUNT),
        feeSwapPath: [],
      },
      account: user1.address,
      subaccount: user0.address,
      subaccountApproval: getEmptySubaccountApproval(),
      subaccountApprovalSigner: user1,
      params,
      deadline: 9999999999,
      relayRouter: multichainSubaccountRouter,
      chainId,
      srcChainId: chainId,
      desChainId: chainId,
      gelatoRelayFeeToken: reentrancyToken.address,
      gelatoRelayFeeAmount: RELAY_FEE_AMOUNT,
    };

    await sendSubaccountCreateOrder(createOrderParams);

    const orderKeys = await getOrderKeys(ctx.dataStore, 0, 1);
    const key = orderKeys[0];

    const emptyRelayParams = getEmptyRelayParams(chainId);
    const reenterCalldata = multichainSubaccountRouter.interface.encodeFunctionData("cancelOrder", [
      emptyRelayParams,
      getEmptySubaccountApproval(),
      user1.address,
      chainId,
      user0.address,
      ethers.constants.HashZero,
    ]);
    await reentrancyToken.setReenterConfig(multichainSubaccountRouter.address, reenterCalldata, 0, 1, false);

    const updateOrderParams: any = {
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: reentrancyToken.address,
        feeAmount: RELAY_FEE_AMOUNT,
        feeSwapPath: [],
      },
      account: user1.address,
      subaccount: user0.address,
      subaccountApproval: getEmptySubaccountApproval(),
      subaccountApprovalSigner: user1,
      chainId,
      srcChainId: chainId,
      desChainId: chainId,
      relayRouter: multichainSubaccountRouter,
      gelatoRelayFeeToken: reentrancyToken.address,
      gelatoRelayFeeAmount: RELAY_FEE_AMOUNT,
      deadline: 9999999999,
      params: {
        key,
        sizeDeltaUsd: decimalToFloat(150 * 1000),
        acceptablePrice: expandDecimals(5002, 12),
        triggerPrice: expandDecimals(5001, 12),
        minOutputAmount: 0,
        validFromTime: 0,
        autoCancel: false,
        executionFeeIncrease: 0,
      },
    };

    await sendSubaccountUpdateOrder(updateOrderParams);

    await expectTokenReentrancyGuard(reentrancyToken);
  },
  "MultichainTransferRouter.bridgeIn -> MultichainTransferRouter.bridgeOut": async (ctx) => {
    const { user0 } = ctx.fixture.accounts;
    const {
      router,
      roleStore,
      dataStore,
      eventEmitter,
      oracle,
      orderVault,
      orderHandler,
      swapHandler,
      externalHandler,
      wnt,
      gasUtils,
      relayUtils,
      multichainUtils,
    } = ctx.fixture.contracts;
    const reentrancyVault = await deployContract("ReentrancyTest", []);
    const multichainTransferRouterFactory = await ethers.getContractFactory("MultichainTransferRouter", {
      libraries: {
        GasUtils: gasUtils.address,
        MultichainUtils: multichainUtils.address,
        RelayUtils: relayUtils.address,
      },
    });
    const multichainTransferRouter = await multichainTransferRouterFactory.deploy({
      router: router.address,
      roleStore: roleStore.address,
      dataStore: dataStore.address,
      eventEmitter: eventEmitter.address,
      oracle: oracle.address,
      orderVault: orderVault.address,
      orderHandler: orderHandler.address,
      swapHandler: swapHandler.address,
      externalHandler: externalHandler.address,
      multichainVault: reentrancyVault.address,
    });
    await grantRole(roleStore, multichainTransferRouter.address, "CONTROLLER");
    const chainId = await ethers.provider.getNetwork().then((network) => network.chainId);

    const emptyRelayParams = getEmptyRelayParams(chainId);
    const reenterCalldata = multichainTransferRouter.interface.encodeFunctionData("bridgeOut", [
      emptyRelayParams,
      user0.address,
      chainId,
      {
        token: wnt.address,
        amount: 0,
        minAmountOut: 0,
        provider: ethers.constants.AddressZero,
        data: "0x",
      },
    ]);
    await reentrancyVault.setReenterConfig(multichainTransferRouter.address, reenterCalldata, 0, 1, false);

    await multichainTransferRouter.connect(user0).bridgeIn(user0.address, wnt.address);
    await expectReentrancyGuard(reentrancyVault);
  },
  "MultichainTransferRouter.bridgeOut -> MultichainTransferRouter.bridgeIn": async (ctx) => {
    const { user0 } = ctx.fixture.accounts;
    const { dataStore, multichainTransferRouter, wnt } = ctx.fixture.contracts;
    const reentrancyToken = await deployReentrantToken();

    await dataStore.setUint(keys.tokenTransferGasLimit(reentrancyToken.address), 2_000_000);

    const { relaySigner, chainId } = await setupMultichainRelay(ctx, user0, RELAY_FEE_AMOUNT);
    const bridgeAmount = expandDecimals(1, 18);

    await seedMultichainBalanceForToken(ctx, user0, reentrancyToken, bridgeAmount);

    const reenterCalldata = multichainTransferRouter.interface.encodeFunctionData("bridgeIn", [
      user0.address,
      reentrancyToken.address,
    ]);
    await reentrancyToken.setReenterConfig(multichainTransferRouter.address, reenterCalldata, 0, 1, false);

    const bridgeOutParams: any = {
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: wnt.address,
        feeAmount: RELAY_FEE_AMOUNT,
        feeSwapPath: [],
      },
      account: user0.address,
      params: {
        token: reentrancyToken.address,
        amount: bridgeAmount,
        minAmountOut: 0,
        provider: ethers.constants.AddressZero,
        data: "0x",
      },
      deadline: 9999999999,
      srcChainId: chainId,
      desChainId: chainId,
      relayRouter: multichainTransferRouter,
      relayFeeToken: wnt.address,
      relayFeeAmount: RELAY_FEE_AMOUNT,
    };

    await sendMultichainBridgeOut(bridgeOutParams);

    await expectTokenReentrancyGuard(reentrancyToken);
  },
  "MultichainTransferRouter.sendNativeToken -> MultichainTransferRouter.bridgeOut": async (ctx) => {
    const { user0 } = ctx.fixture.accounts;
    const { dataStore, multichainTransferRouter } = ctx.fixture.contracts;
    const reentrancyTest = await deployContract("ReentrancyTest", []);
    const chainId = await ethers.provider.getNetwork().then((network) => network.chainId);

    const emptyRelayParams = getEmptyRelayParams(chainId);
    const reenterCalldata = multichainTransferRouter.interface.encodeFunctionData("bridgeOut", [
      emptyRelayParams,
      user0.address,
      chainId,
      {
        token: ethers.constants.AddressZero,
        amount: 0,
        minAmountOut: 0,
        provider: ethers.constants.AddressZero,
        data: "0x",
      },
    ]);
    await reentrancyTest.setReenterConfig(multichainTransferRouter.address, reenterCalldata, 0, 1, false);

    await dataStore.setUint(keys.NATIVE_TOKEN_TRANSFER_GAS_LIMIT, bigNumberify(2_000_000));

    const amount = expandDecimals(1, 15);
    await multichainTransferRouter.connect(user0).sendNativeToken(reentrancyTest.address, amount, { value: amount });

    await expectReentrancyGuard(reentrancyTest);
  },
};
