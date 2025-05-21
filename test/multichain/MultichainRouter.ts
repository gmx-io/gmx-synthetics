import { expect } from "chai";
import { impersonateAccount, setBalance, time } from "@nomicfoundation/hardhat-network-helpers";

import { decimalToFloat, expandDecimals } from "../../utils/math";
import { deployFixture } from "../../utils/fixture";
import { GELATO_RELAY_ADDRESS } from "../../utils/relay/addresses";
import {
  sendCreateDeposit,
  sendCreateGlvDeposit,
  sendCreateGlvWithdrawal,
  sendClaimAffiliateRewards,
  sendClaimFundingFees,
  sendClaimCollateral,
} from "../../utils/relay/multichain";
import { sendBatch, sendCancelOrder, sendCreateOrder, sendUpdateOrder } from "../../utils/relay/gelatoRelay";
import * as keys from "../../utils/keys";
import { executeDeposit, handleDeposit } from "../../utils/deposit";
import { getBalanceOf } from "../../utils/token";
import { BigNumberish, Contract } from "ethers";
import { executeGlvDeposit, executeGlvWithdrawal, getGlvDepositCount, getGlvWithdrawalCount } from "../../utils/glv";
import {
  DecreasePositionSwapType,
  executeOrder,
  getOrderCount,
  getOrderKeys,
  handleOrder,
  OrderType,
} from "../../utils/order";
import { hashData, hashString } from "../../utils/hash";
import { getPositionCount } from "../../utils/position";
import { expectBalance } from "../../utils/validation";
import { executeLiquidation } from "../../utils/liquidation";
import { executeAdl, updateAdlState } from "../../utils/adl";
import { getClaimableCollateralTimeKey } from "../../utils/collateral";
import { mintAndBridge } from "./utils";

describe("MultichainRouter", () => {
  let fixture;
  let user0, user1, user2, user3;
  let reader,
    dataStore,
    multichainGmRouter,
    multichainOrderRouter,
    multichainGlvRouter,
    multichainVault,
    depositVault,
    glvVault,
    ethUsdMarket,
    ethUsdGlvAddress,
    wethPriceFeed,
    wnt,
    usdc,
    chainlinkPriceFeedProvider,
    multichainClaimsRouter,
    mockStargatePoolUsdc,
    mockStargatePoolWnt,
    referralStorage;
  let relaySigner;
  let chainId;

  let defaultDepositParams;
  let createDepositParams: Parameters<typeof sendCreateDeposit>[0];

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1, user2, user3 } = fixture.accounts);
    ({
      reader,
      dataStore,
      multichainGmRouter,
      multichainOrderRouter,
      multichainGlvRouter,
      multichainVault,
      depositVault,
      glvVault,
      ethUsdMarket,
      ethUsdGlvAddress,
      wethPriceFeed,
      wnt,
      usdc,
      chainlinkPriceFeedProvider,
      multichainClaimsRouter,
      mockStargatePoolUsdc,
      mockStargatePoolWnt,
      referralStorage,
    } = fixture.contracts);

    defaultDepositParams = {
      addresses: {
        receiver: user1.address,
        callbackContract: user2.address,
        uiFeeReceiver: user2.address,
        market: ethUsdMarket.marketToken,
        initialLongToken: ethUsdMarket.longToken,
        initialShortToken: ethUsdMarket.shortToken,
        longTokenSwapPath: [],
        shortTokenSwapPath: [],
      },
      minMarketTokens: 100,
      shouldUnwrapNativeToken: false,
      executionFee: expandDecimals(4, 15),
      callbackGasLimit: "200000",
      dataList: [],
    };

    await impersonateAccount(GELATO_RELAY_ADDRESS);
    await setBalance(GELATO_RELAY_ADDRESS, expandDecimals(1, 16)); // ETH to pay tx fees

    relaySigner = await hre.ethers.getSigner(GELATO_RELAY_ADDRESS);
    chainId = await hre.ethers.provider.getNetwork().then((network) => network.chainId);

    const wntAmount = expandDecimals(10, 18);
    const usdcAmount = expandDecimals(45_000, 6);
    const feeAmount = expandDecimals(6, 15);

    createDepositParams = {
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: wnt.address,
        feeAmount: feeAmount, // 0.006 ETH
        feeSwapPath: [],
      },
      transferRequests: {
        tokens: [wnt.address, usdc.address],
        receivers: [depositVault.address, depositVault.address],
        amounts: [wntAmount, usdcAmount],
      },
      account: user0.address,
      params: defaultDepositParams,
      deadline: 9999999999,
      chainId,
      srcChainId: chainId, // 0 would mean same chain action
      desChainId: chainId,
      relayRouter: multichainGmRouter,
      relayFeeToken: wnt.address,
      relayFeeAmount: expandDecimals(2, 15), // 0.002 ETH
    };

    await dataStore.setAddress(keys.FEE_RECEIVER, user3.address);

    await dataStore.setBool(keys.isSrcChainIdEnabledKey(chainId), true);

    await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolWnt.address), true);
    await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolWnt.address), true);
    await mintAndBridge(fixture, { token: wnt, tokenAmount: wntAmount.add(feeAmount) });

    await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolUsdc.address), true);
    await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolUsdc.address), true);
    await mintAndBridge(fixture, { token: usdc, tokenAmount: usdcAmount });
  });

  describe("MultichainGlvRouter", () => {
    let defaultGlvDepositParams;
    let createGlvDepositParams: Parameters<typeof sendCreateGlvDeposit>[0];
    const feeAmount = expandDecimals(4, 15);

    beforeEach(async () => {
      defaultGlvDepositParams = {
        addresses: {
          glv: ethUsdGlvAddress,
          receiver: user1.address,
          callbackContract: user2.address,
          uiFeeReceiver: user3.address,
          market: ethUsdMarket.marketToken,
          initialLongToken: ethers.constants.AddressZero,
          initialShortToken: ethers.constants.AddressZero,
          longTokenSwapPath: [],
          shortTokenSwapPath: [],
        },
        minGlvTokens: 100,
        executionFee: 0,
        callbackGasLimit: "200000",
        shouldUnwrapNativeToken: true,
        isMarketTokenDeposit: true,
        dataList: [],
      };

      createGlvDepositParams = {
        sender: relaySigner,
        signer: user1,
        feeParams: {
          feeToken: wnt.address,
          feeAmount: feeAmount, // 0.004 ETH
          feeSwapPath: [],
        },
        transferRequests: {
          tokens: [ethUsdMarket.marketToken],
          receivers: [glvVault.address],
          amounts: [expandDecimals(95_000, 18)],
        },
        account: user1.address,
        params: defaultGlvDepositParams,
        deadline: 9999999999,
        chainId,
        srcChainId: chainId,
        desChainId: chainId,
        relayRouter: multichainGlvRouter,
        relayFeeToken: wnt.address,
        relayFeeAmount: expandDecimals(2, 15), // 0.002 ETH
      };
    });

    describe("createGlvDeposit", () => {
      it("creates glvDeposit with GM tokens and sends relayer fee", async () => {
        await sendCreateDeposit(createDepositParams); // leaves the residualFee (i.e. executionfee) of 0.004 ETH fee in multichainVault/user's multichain balance
        await mintAndBridge(fixture, { account: user1, token: wnt, tokenAmount: feeAmount }); // add additional fee to user1's multichain balance
        await executeDeposit(fixture, { gasUsageLabel: "executeDeposit" });

        // before glv deposit is created (user has 95k GM and 0 GLV)
        expect(await getGlvDepositCount(dataStore)).eq(0);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdMarket.marketToken))).eq(
          expandDecimals(95_000, 18)
        ); // GM
        expect(await getBalanceOf(ethUsdMarket.marketToken, ethUsdGlvAddress)).eq(0); // GM
        expect(await getBalanceOf(ethUsdMarket.marketToken, glvVault.address)).eq(0); // GM
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdGlvAddress))).eq(0); // GLV

        await sendCreateGlvDeposit(createGlvDepositParams);

        // after glv deposit is created (user has 0 GM and 0 GLV, his 95k GM moved from user to glvVault)
        expect(await getGlvDepositCount(dataStore)).eq(1);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdMarket.marketToken))).eq(0); // GM
        expect(await getBalanceOf(ethUsdMarket.marketToken, ethUsdGlvAddress)).eq(0); // GM
        expect(await getBalanceOf(ethUsdMarket.marketToken, glvVault.address)).eq(expandDecimals(95_000, 18)); // GM
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdGlvAddress))).eq(0); // GLV

        await executeGlvDeposit(fixture, { gasUsageLabel: "executeGlvDeposit" });

        // after glv deposit is executed (user has 0 GM and 95k GLV, his 95k GM moved from glvVault to glv pool)
        expect(await getGlvDepositCount(dataStore)).eq(0);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdMarket.marketToken))).eq(0); // GM
        expect(await getBalanceOf(ethUsdMarket.marketToken, ethUsdGlvAddress)).eq(expandDecimals(95_000, 18)); // GM
        expect(await getBalanceOf(ethUsdMarket.marketToken, glvVault.address)).eq(0); // GM
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdGlvAddress))).eq(
          expandDecimals(95_000, 18)
        ); // GLV
      });

      it("creates glvDeposit with long/short tokens and sends relayer fee", async () => {
        const wntAmount = expandDecimals(10, 18);
        const usdcAmount = expandDecimals(40_000, 6);
        await mintAndBridge(fixture, { account: user1, token: wnt, tokenAmount: wntAmount.add(feeAmount) });
        await mintAndBridge(fixture, { account: user1, token: usdc, tokenAmount: usdcAmount });

        createGlvDepositParams.params.isMarketTokenDeposit = false;
        createGlvDepositParams.params.addresses.initialLongToken = ethUsdMarket.longToken;
        createGlvDepositParams.params.addresses.initialShortToken = ethUsdMarket.shortToken;
        createGlvDepositParams.transferRequests = {
          tokens: [wnt.address, usdc.address],
          receivers: [glvVault.address, glvVault.address],
          amounts: [wntAmount, usdcAmount],
        };

        expect(await getGlvDepositCount(dataStore)).eq(0);

        await sendCreateGlvDeposit(createGlvDepositParams);

        expect(await getGlvDepositCount(dataStore)).eq(1);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdGlvAddress))).eq(0); // 0 GLV

        await executeGlvDeposit(fixture, { gasUsageLabel: "executeGlvDeposit" });

        expect(await getGlvDepositCount(dataStore)).eq(0);
        expect(await getBalanceOf(ethUsdGlvAddress, multichainVault.address)).eq(expandDecimals(90_000, 18)); // 90k GLV
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdGlvAddress))).eq(
          expandDecimals(90_000, 18)
        ); // 90k GLV
      });
    });

    describe("createGlvWithdrawal", () => {
      let defaultGlvWithdrawalParams;
      let createGlvWithdrawalParams: Parameters<typeof sendCreateGlvWithdrawal>[0];
      beforeEach(async () => {
        defaultGlvWithdrawalParams = {
          addresses: {
            receiver: user1.address,
            callbackContract: user2.address,
            uiFeeReceiver: user3.address,
            market: ethUsdMarket.marketToken,
            glv: ethUsdGlvAddress,
            longTokenSwapPath: [],
            shortTokenSwapPath: [],
          },
          minLongTokenAmount: 0,
          minShortTokenAmount: 0,
          shouldUnwrapNativeToken: false,
          executionFee: 0, // expandDecimals(1, 15), // 0.001 ETH
          callbackGasLimit: "200000",
          dataList: [],
        };

        createGlvWithdrawalParams = {
          sender: relaySigner,
          signer: user1,
          feeParams: {
            feeToken: wnt.address,
            feeAmount: feeAmount, // 0.004 ETH
            feeSwapPath: [],
          },
          transferRequests: {
            tokens: [ethUsdGlvAddress],
            receivers: [glvVault.address],
            amounts: [expandDecimals(95_000, 18)],
          },
          account: user1.address,
          params: defaultGlvWithdrawalParams,
          deadline: 9999999999,
          chainId,
          srcChainId: chainId,
          desChainId: chainId,
          relayRouter: multichainGlvRouter,
          relayFeeToken: wnt.address,
          relayFeeAmount: expandDecimals(2, 15), // 0.002 ETH
        };
      });

      it("creates glvWithdrawal and sends relayer fee", async () => {
        await sendCreateDeposit(createDepositParams);
        await mintAndBridge(fixture, { account: user1, token: wnt, tokenAmount: feeAmount }); // add additional fee to user1's multichain balance
        await executeDeposit(fixture, { gasUsageLabel: "executeDeposit" });
        await sendCreateGlvDeposit(createGlvDepositParams);
        await executeGlvDeposit(fixture, { gasUsageLabel: "executeGlvDeposit" });

        // before glv withdrawal is created (user has 0 GM and 95k GLV, the 95k GM tokens user initially had are now in ethUsdGlv)
        expect(await getGlvWithdrawalCount(dataStore)).eq(0);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdMarket.marketToken))).eq(0); // user's GM
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdGlvAddress))).eq(
          expandDecimals(95_000, 18)
        ); // user's GLV
        expect(await getBalanceOf(ethUsdGlvAddress, glvVault.address)).eq(0); // GLV in glvVault
        expect(await getBalanceOf(ethUsdMarket.marketToken, ethUsdGlvAddress)).eq(expandDecimals(95_000, 18)); // GM in ethUsdGlv

        // create glvWithdrawal
        await sendCreateGlvWithdrawal(createGlvWithdrawalParams);

        // before glv withdrawal is executed (user has 0 GM and 95k GLV)
        expect(await getGlvWithdrawalCount(dataStore)).eq(1);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdMarket.marketToken))).eq(0); // user's GM
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdGlvAddress))).eq(0); // user's GLV moved to glvVault
        expect(await getBalanceOf(ethUsdGlvAddress, glvVault.address)).eq(expandDecimals(95_000, 18)); // GLV in glvVault
        expect(await getBalanceOf(ethUsdMarket.marketToken, ethUsdGlvAddress)).eq(expandDecimals(95_000, 18)); // GM
        // user's multicahin assets
        // expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).eq(0);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).eq(0);

        await executeGlvWithdrawal(fixture, { gasUsageLabel: "executeGlvWithdrawal" });

        // after glv withdrawal is executed (user has 0 GM, 0 GLV and receives back 10 ETH and 45,000 USDC)
        expect(await getGlvWithdrawalCount(dataStore)).eq(0);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdGlvAddress))).eq(0); // GLV
        // user's multicahin assets
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).eq(
          expandDecimals(10_004, 15)
        ); // 10.004 ETH
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).eq(
          expandDecimals(45_000, 6)
        ); // 45,000 USDC
      });
    });
  });

  describe("MultichainOrderRouter", () => {
    const executionFee = expandDecimals(4, 15); // 0.004 ETH
    const relayFeeAmount = expandDecimals(2, 15); // 0.004 ETH
    const feeAmount = executionFee.add(relayFeeAmount); // 0.006 ETH

    let defaultOrderParams;
    const collateralDeltaAmount = expandDecimals(1, 18); // 1 ETH
    beforeEach(async () => {
      defaultOrderParams = {
        addresses: {
          receiver: user1.address,
          cancellationReceiver: user1.address,
          callbackContract: user1.address,
          uiFeeReceiver: user2.address,
          market: ethUsdMarket.marketToken,
          initialCollateralToken: wnt.address,
          swapPath: [],
        },
        numbers: {
          sizeDeltaUsd: decimalToFloat(25_000), // 5x leverage
          initialCollateralDeltaAmount: collateralDeltaAmount, // 1 ETH
          triggerPrice: decimalToFloat(4800),
          acceptablePrice: decimalToFloat(4900),
          executionFee: executionFee, // 0.004 ETH
          callbackGasLimit: "200000",
          minOutputAmount: 700,
          validFromTime: 0,
        },
        orderType: OrderType.LimitIncrease,
        decreasePositionSwapType: DecreasePositionSwapType.SwapCollateralTokenToPnlToken,
        isLong: true,
        shouldUnwrapNativeToken: false,
        referralCode: hashString("referralCode"),
        dataList: [],
      };
    });

    let createOrderParams: Parameters<typeof sendCreateOrder>[0];
    beforeEach(async () => {
      createOrderParams = {
        sender: relaySigner,
        signer: user1,
        feeParams: {
          feeToken: wnt.address,
          feeAmount: feeAmount, // 0.006 ETH
          feeSwapPath: [],
        },
        account: user1.address,
        params: defaultOrderParams,
        deadline: 9999999999,
        srcChainId: chainId, // 0 means non-multichain action
        desChainId: chainId, // for non-multichain actions, desChainId is the same as chainId
        relayRouter: multichainOrderRouter,
        chainId,
        gelatoRelayFeeToken: wnt.address,
        gelatoRelayFeeAmount: relayFeeAmount, // 0.002 ETH
      };
    });

    describe("createOrder", () => {
      it("creates multichain order and sends relayer fee", async () => {
        await sendCreateDeposit(createDepositParams);
        await executeDeposit(fixture, { gasUsageLabel: "executeMultichainDeposit" });
        const initialUser1Balance = await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address)); // user1 has some residual fee from deposit (i.e. the diff between feeAmount and relayFeeAmount)
        const initialFeeReceiverBalance = await wnt.balanceOf(GELATO_RELAY_ADDRESS);

        await mintAndBridge(fixture, { account: user1, token: wnt, tokenAmount: collateralDeltaAmount.add(feeAmount) });

        expect(await getOrderCount(dataStore)).to.eq(0);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(
          initialUser1Balance.add(collateralDeltaAmount).add(feeAmount)
        );

        await sendCreateOrder(createOrderParams);

        expect(await getOrderCount(dataStore)).to.eq(1);
        expect(await getPositionCount(dataStore)).to.eq(0);
        expect(await wnt.balanceOf(GELATO_RELAY_ADDRESS)).to.eq(initialFeeReceiverBalance.add(relayFeeAmount));
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(
          initialUser1Balance
        );

        await executeOrder(fixture, { gasUsageLabel: "executeOrder" });

        expect(await getOrderCount(dataStore)).to.eq(0);
        expect(await getPositionCount(dataStore)).to.eq(1);
      });

      it("liquidation increases user's multichain balance", async () => {
        // order is created from a source chain
        await sendCreateDeposit(createDepositParams);
        await executeDeposit(fixture, { gasUsageLabel: "executeMultichainDeposit" });
        await mintAndBridge(fixture, {
          account: user1,
          token: wnt,
          tokenAmount: collateralDeltaAmount.add(expandDecimals(2, 15)),
        });
        await sendCreateOrder(createOrderParams);
        await executeOrder(fixture, { gasUsageLabel: "executeOrder" });

        // forcing liquidation
        await dataStore.setUint(
          keys.minCollateralFactorForLiquidationKey(ethUsdMarket.marketToken),
          expandDecimals(1, 30)
        );

        const user1WntBalanceBefore = await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address));

        await executeLiquidation(fixture, {
          account: user1.address,
          market: ethUsdMarket,
          collateralToken: wnt,
          isLong: true,
          minPrices: [expandDecimals(5000, 4), expandDecimals(8, 5)],
          maxPrices: [expandDecimals(5000, 4), expandDecimals(8, 5)],
          gasUsageLabel: "liquidationHandler.executeLiquidation",
        });

        // user's multichain balances increased by the collateral amount after liquidation
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(
          user1WntBalanceBefore.add(collateralDeltaAmount)
        );
      });

      it("adl increases user's multichain balance", async () => {
        // order is created from a source chain
        await sendCreateDeposit(createDepositParams);
        await executeDeposit(fixture, { gasUsageLabel: "executeMultichainDeposit" });
        await mintAndBridge(fixture, {
          account: user1,
          token: wnt,
          tokenAmount: collateralDeltaAmount.add(expandDecimals(2, 15)),
        });
        await sendCreateOrder(createOrderParams);
        await executeOrder(fixture, { gasUsageLabel: "executeOrder" });

        const maxPnlFactorForAdlKey = keys.maxPnlFactorKey(keys.MAX_PNL_FACTOR_FOR_ADL, ethUsdMarket.marketToken, true);
        const minPnlFactorAfterAdlKey = keys.minPnlFactorAfterAdl(ethUsdMarket.marketToken, true);
        await dataStore.setUint(maxPnlFactorForAdlKey, decimalToFloat(10, 2)); // 10%
        await dataStore.setUint(minPnlFactorAfterAdlKey, decimalToFloat(2, 2)); // 2%
        await wethPriceFeed.setAnswer(expandDecimals(10000, 8));

        await updateAdlState(fixture, {
          market: ethUsdMarket,
          isLong: true,
          tokens: [wnt.address, usdc.address],
          minPrices: [expandDecimals(10000, 4), expandDecimals(1, 6)],
          maxPrices: [expandDecimals(10000, 4), expandDecimals(1, 6)],
          gasUsageLabel: "updateAdlState",
        });

        const initialUserMultichainBalance = await dataStore.getUint(
          keys.multichainBalanceKey(user1.address, wnt.address)
        );

        await executeAdl(fixture, {
          account: user1.address,
          market: ethUsdMarket,
          collateralToken: wnt,
          isLong: true,
          sizeDeltaUsd: decimalToFloat(10 * 1000), // 10k USD --> 1 ETH will be added to user's multichain balance
          tokens: [wnt.address, usdc.address],
          minPrices: [expandDecimals(10000, 4), expandDecimals(1, 6)],
          maxPrices: [expandDecimals(10000, 4), expandDecimals(1, 6)],
          gasUsageLabel: "executeAdl",
        });

        // user's multichain balances increased by 1 ETH after adl (adl was executed at 1 ETH = 10k USD)
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(
          initialUserMultichainBalance.add(expandDecimals(1, 18)) // user's initial balance + collateralDeltaAmount
        );
      });

      it("refunds multichain execution fee", async () => {
        const executionFee = expandDecimals(25, 14); // 0.0025 ETH

        await handleDeposit(fixture, {
          create: {
            market: ethUsdMarket,
            longTokenAmount: expandDecimals(1000, 18),
            shortTokenAmount: expandDecimals(1000 * 1000, 6),
          },
        });

        await dataStore.setUint(keys.EXECUTION_GAS_FEE_MULTIPLIER_FACTOR, decimalToFloat(1));

        const params = {
          addresses: {
            receiver: user1.address,
            cancellationReceiver: user1.address,
            callbackContract: user1.address,
            uiFeeReceiver: user2.address,
            market: ethUsdMarket.marketToken,
            initialCollateralToken: usdc.address,
            swapPath: [],
          },
          numbers: {
            sizeDeltaUsd: decimalToFloat(100 * 1000),
            initialCollateralDeltaAmount: collateralDeltaAmount,
            triggerPrice: decimalToFloat(4800),
            acceptablePrice: expandDecimals(4990, 12),
            executionFee: executionFee, // feeAmount - relayFeeAmount
            callbackGasLimit: "200001",
            minOutputAmount: expandDecimals(50000, 6),
            validFromTime: 0,
          },
          orderType: OrderType.MarketIncrease,
          decreasePositionSwapType: DecreasePositionSwapType.SwapCollateralTokenToPnlToken,
          isLong: false,
          shouldUnwrapNativeToken: false,
          referralCode: hashString("referralCode"),
          dataList: [],
        };

        const initialBalance = await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address));

        await mintAndBridge(fixture, { account: user1, token: wnt, tokenAmount: feeAmount });
        await mintAndBridge(fixture, { account: user1, token: usdc, tokenAmount: collateralDeltaAmount });
        await sendCreateOrder({ ...createOrderParams, gelatoRelayFeeAmount: feeAmount.sub(executionFee), params });
        await executeOrder(fixture, { gasUsageLabel: "executeOrder" });

        expect(
          (await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).sub(initialBalance)
        ).closeTo("410692983285544", "10000000000000");
      });
    });

    describe("updateOrder", () => {
      let updateOrderParams: Parameters<typeof sendUpdateOrder>[0];

      beforeEach(() => {
        updateOrderParams = {
          sender: relaySigner,
          signer: user1,
          feeParams: {
            feeToken: wnt.address,
            feeAmount: relayFeeAmount, // 0.002 ETH (just the relay fee, no executionFee needed)
            feeSwapPath: [],
          },
          account: user1.address,
          params: {
            key: ethers.constants.HashZero,
            sizeDeltaUsd: decimalToFloat(1),
            acceptablePrice: decimalToFloat(2),
            triggerPrice: decimalToFloat(3),
            minOutputAmount: 4,
            validFromTime: 5,
            autoCancel: true,
            executionFeeIncrease: 0,
          },
          deadline: 9999999999,
          srcChainId: chainId, // 0 means non-multichain action
          desChainId: chainId, // for non-multichain actions, desChainId is the same as chainId
          relayRouter: multichainOrderRouter,
          chainId,
          gelatoRelayFeeToken: wnt.address,
          gelatoRelayFeeAmount: relayFeeAmount, // 0.002 ETH
        };
      });

      it("updates multichain order and sends relayer fee", async () => {
        await sendCreateDeposit(createDepositParams);
        await executeDeposit(fixture, { gasUsageLabel: "executeMultichainDeposit" });
        await mintAndBridge(fixture, { account: user1, token: wnt, tokenAmount: collateralDeltaAmount.add(feeAmount) });
        await sendCreateOrder(createOrderParams);
        const initialFeeReceiverBalance = await wnt.balanceOf(GELATO_RELAY_ADDRESS);
        const initialUser1Balance = await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address)); // executionFee was returned to user since keeper isn't enabled and keeperFee == 0

        const orderKeys = await getOrderKeys(dataStore, 0, 1);
        let order = await reader.getOrder(dataStore.address, orderKeys[0]);
        expect(order.numbers.sizeDeltaUsd).eq(decimalToFloat(25000));
        expect(order.numbers.acceptablePrice).eq(decimalToFloat(4900));
        expect(order.numbers.triggerPrice).eq(decimalToFloat(4800));
        expect(order.numbers.minOutputAmount).eq(700);
        expect(order.numbers.validFromTime).eq(0);
        expect(order.flags.autoCancel).eq(false);

        await sendUpdateOrder({ ...updateOrderParams, params: { ...updateOrderParams.params, key: orderKeys[0] } });

        order = await reader.getOrder(dataStore.address, orderKeys[0]);
        expect(order.numbers.sizeDeltaUsd).eq(decimalToFloat(1));
        expect(order.numbers.acceptablePrice).eq(decimalToFloat(2));
        expect(order.numbers.triggerPrice).eq(decimalToFloat(3));
        expect(order.numbers.minOutputAmount).eq(4);
        expect(order.numbers.validFromTime).eq(5);
        expect(order.flags.autoCancel).eq(true);
        await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, initialFeeReceiverBalance.add(relayFeeAmount));
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(
          initialUser1Balance.sub(relayFeeAmount)
        );
      });
    });

    describe("cancelOrder", () => {
      let cancelOrderParams: Parameters<typeof sendCancelOrder>[0];

      beforeEach(() => {
        cancelOrderParams = {
          sender: relaySigner,
          signer: user1,
          feeParams: {
            feeToken: wnt.address,
            feeAmount: relayFeeAmount, // 0.002 ETH
            feeSwapPath: [],
          },
          account: user1.address,
          key: ethers.constants.HashZero,
          deadline: 9999999999,
          srcChainId: chainId, // 0 means non-multichain action
          desChainId: chainId, // for non-multichain actions, desChainId is the same as chainId
          relayRouter: multichainOrderRouter,
          chainId,
          gelatoRelayFeeToken: wnt.address,
          gelatoRelayFeeAmount: relayFeeAmount, // 0.002 ETH
        };
      });

      it("cancels multichain order and sends relayer fee", async () => {
        await sendCreateDeposit(createDepositParams);
        await executeDeposit(fixture, { gasUsageLabel: "executeMultichainDeposit" }); // 0.004 ETH - executionFee is return to user1's multichain balance
        await mintAndBridge(fixture, {
          account: user1,
          token: wnt,
          tokenAmount: collateralDeltaAmount.add(relayFeeAmount),
        });
        await sendCreateOrder(createOrderParams);
        const initialFeeReceiverBalance = await wnt.balanceOf(GELATO_RELAY_ADDRESS);

        const orderKeys = await getOrderKeys(dataStore, 0, 1);
        expect(await getOrderCount(dataStore)).to.eq(1);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(0);

        await mintAndBridge(fixture, {
          account: user1,
          token: wnt,
          tokenAmount: relayFeeAmount,
        });
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(relayFeeAmount);

        await sendCancelOrder({ ...cancelOrderParams, key: orderKeys[0] });

        expect(await getOrderCount(dataStore)).to.eq(0);
        await expectBalance(
          wnt.address,
          GELATO_RELAY_ADDRESS,
          initialFeeReceiverBalance.add(cancelOrderParams.gelatoRelayFeeAmount)
        );
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(
          collateralDeltaAmount.add(executionFee)
        ); // 1.00 + 0.004 = 1.004 ETH
      });
    });

    describe("batch", () => {
      let defaultParams;
      let createOrderParams: Parameters<typeof sendCreateOrder>[0];
      let batchParams: Parameters<typeof sendBatch>[0];

      beforeEach(async () => {
        defaultParams = {
          addresses: {
            receiver: user1.address,
            cancellationReceiver: user1.address,
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
            executionFee: 0,
            callbackGasLimit: "200000",
            minOutputAmount: 700,
            validFromTime: 0,
          },
          orderType: OrderType.LimitIncrease,
          decreasePositionSwapType: DecreasePositionSwapType.SwapCollateralTokenToPnlToken,
          isLong: true,
          shouldUnwrapNativeToken: true,
          referralCode: hashString("referralCode"),
          dataList: [],
        };

        createOrderParams = {
          sender: relaySigner,
          signer: user1,
          feeParams: {
            feeToken: wnt.address,
            feeAmount: expandDecimals(2, 15), // 0.002 ETH
            feeSwapPath: [],
          },
          tokenPermits: [],
          account: user1.address,
          params: defaultParams,
          deadline: 9999999999,
          desChainId: chainId, // for non-multichain actions, desChainId is the same as chainId
          relayRouter: multichainOrderRouter,
          chainId,
          gelatoRelayFeeToken: wnt.address,
          gelatoRelayFeeAmount: expandDecimals(1, 15),
        };

        batchParams = {
          sender: relaySigner,
          signer: user1,
          feeParams: {
            feeToken: wnt.address,
            feeAmount: expandDecimals(2, 15), // 0.002 ETH
            feeSwapPath: [],
          },
          tokenPermits: [],
          account: user1.address,
          createOrderParamsList: [],
          updateOrderParamsList: [],
          cancelOrderKeys: [],
          deadline: 9999999999,
          relayRouter: multichainOrderRouter,
          chainId,
          srcChainId: chainId, // 0 means non-multichain action
          desChainId: chainId, // for non-multichain actions, desChainId is the same as chainId
          gelatoRelayFeeToken: wnt.address,
          gelatoRelayFeeAmount: expandDecimals(1, 15),
        };
      });

      it("batch: creates multichain orders", async () => {
        await sendCreateDeposit(createDepositParams);
        await executeDeposit(fixture, { gasUsageLabel: "executeMultichainDeposit" });
        const collateralAmount = createOrderParams.params.numbers.initialCollateralDeltaAmount;
        await mintAndBridge(fixture, {
          account: user1,
          token: wnt,
          tokenAmount: collateralAmount.mul(2).add(expandDecimals(2, 15)),
        });
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(
          collateralAmount.mul(2).add(expandDecimals(6, 15))
        );

        const executionFee = expandDecimals(2, 15);
        const initialFeeReceiverBalance = await wnt.balanceOf(GELATO_RELAY_ADDRESS);
        batchParams.feeParams.feeAmount = expandDecimals(6, 15); // relay fee is 0.001, execution fee is 2 * 0.002, 0.001 should be sent back
        batchParams.createOrderParamsList = [defaultParams, defaultParams];
        batchParams.createOrderParamsList[0].numbers.executionFee = executionFee;
        batchParams.createOrderParamsList[1].numbers.executionFee = executionFee;
        expect(await getOrderCount(dataStore)).eq(0);

        await sendBatch({
          ...batchParams,
        });

        expect(await getOrderCount(dataStore)).eq(2);
        const orderKeys = await getOrderKeys(dataStore, 0, 2);
        const order = await reader.getOrder(dataStore.address, orderKeys[0]);
        const order2 = await reader.getOrder(dataStore.address, orderKeys[1]);
        expect(order.addresses.account).eq(user1.address);
        expect(order2.addresses.account).eq(user1.address);

        // user's initial balance: 0.006 ETH
        // keepers receive 2 * executionFee: 0.004 ETH
        // relayer receives 1 * relayFee: 0.001 ETH
        // user receives 0.001 ETH back
        expect(await wnt.balanceOf(GELATO_RELAY_ADDRESS)).eq(
          initialFeeReceiverBalance.add(createOrderParams.gelatoRelayFeeAmount)
        );
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(
          expandDecimals(1, 15)
        ); // 0.001 ETH
      });
    });
  });

  describe("MultichainClaimsRouter", () => {
    const feeAmount = expandDecimals(3, 15);
    const relayFeeAmount = expandDecimals(2, 15);

    beforeEach(async () => {
      await handleDeposit(fixture, {
        create: {
          account: user0,
          market: ethUsdMarket,
          longTokenAmount: expandDecimals(100, 18),
          shortTokenAmount: expandDecimals(100 * 5000, 6),
        },
        execute: {
          precisions: [8, 18],
          tokens: [wnt.address, usdc.address],
          minPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
          maxPrices: [expandDecimals(5000, 4), expandDecimals(1, 6)],
        },
      });
    });

    describe("claimFundingFees", () => {
      beforeEach(async () => {
        await dataStore.setUint(keys.fundingFactorKey(ethUsdMarket.marketToken), decimalToFloat(1, 10));
        await dataStore.setUint(keys.fundingExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(1));

        await handleOrder(fixture, {
          create: {
            account: user0,
            market: ethUsdMarket,
            initialCollateralToken: usdc,
            initialCollateralDeltaAmount: expandDecimals(100 * 1000, 6), // $100,000
            swapPath: [],
            sizeDeltaUsd: decimalToFloat(200 * 1000), // 2x Position
            acceptablePrice: expandDecimals(5000, 12),
            executionFee: expandDecimals(1, 15),
            minOutputAmount: 0,
            orderType: OrderType.MarketIncrease,
            isLong: true,
            shouldUnwrapNativeToken: false,
          },
        });
        await handleOrder(fixture, {
          create: {
            account: user1,
            market: ethUsdMarket,
            initialCollateralToken: usdc,
            initialCollateralDeltaAmount: expandDecimals(50 * 1000, 6), // $50,000
            swapPath: [],
            sizeDeltaUsd: decimalToFloat(100 * 1000), // 2x Position
            acceptablePrice: expandDecimals(5000, 12),
            executionFee: expandDecimals(1, 15),
            minOutputAmount: 0,
            orderType: OrderType.MarketIncrease,
            isLong: false,
            shouldUnwrapNativeToken: false,
          },
        });

        await time.increase(100 * 24 * 60 * 60);

        await handleOrder(fixture, {
          create: {
            account: user1,
            market: ethUsdMarket,
            initialCollateralToken: usdc,
            initialCollateralDeltaAmount: expandDecimals(50 * 1000, 6), // $50,000
            swapPath: [],
            sizeDeltaUsd: decimalToFloat(100 * 1000), // 2x Position
            acceptablePrice: expandDecimals(5000, 12),
            executionFee: expandDecimals(1, 15),
            minOutputAmount: 0,
            orderType: OrderType.MarketDecrease,
            isLong: false,
            shouldUnwrapNativeToken: false,
          },
        });
      });

      it("User receives funding fees in his multichain balance, pays relay fee from existing multichain balance", async () => {
        // increase user's wnt multichain balance to pay for fees
        await mintAndBridge(fixture, { account: user1, token: wnt, tokenAmount: feeAmount });

        // the user will pay the relay fee from his newly claimed tokens
        const createClaimParams: Parameters<typeof sendClaimFundingFees>[0] = {
          sender: relaySigner,
          signer: user1,
          feeParams: {
            feeToken: wnt.address, // user's multichain balance must have enough wnt to pay for fees
            feeAmount: feeAmount,
            feeSwapPath: [],
          },
          account: user1.address,
          params: {
            markets: [ethUsdMarket.marketToken],
            tokens: [usdc.address],
            receiver: user1.address,
          },
          deadline: 9999999999,
          srcChainId: chainId, // 0 means non-multichain action
          desChainId: chainId, // for non-multichain actions, desChainId is the same as chainId
          relayRouter: multichainClaimsRouter,
          chainId,
          relayFeeToken: wnt.address,
          relayFeeAmount: relayFeeAmount,
        };

        expect(await wnt.balanceOf(GELATO_RELAY_ADDRESS)).to.eq(0);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(feeAmount); // 0.003 ETH
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(0); // $0

        await sendClaimFundingFees(createClaimParams);

        expect(await wnt.balanceOf(GELATO_RELAY_ADDRESS)).to.eq(relayFeeAmount); // 0.002 ETH relayFeeAmount
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(
          feeAmount.sub(relayFeeAmount)
        ); // 0.003 - 0.002 = 0.001 ETH (received as residualFee)
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq("57600019"); // 57.600019 USD (received from claiming)
      });

      it("User receives funding fees in his multichain balance, pays relay fee from newly claimed tokens", async () => {
        // the user will pay the relay fee from his newly claimed usdc tokens
        const createClaimParams: Parameters<typeof sendClaimFundingFees>[0] = {
          sender: relaySigner,
          signer: user1,
          feeParams: {
            feeToken: usdc.address, // user will use his newly claimed usdc to pay for fees
            feeAmount: expandDecimals(15, 6), // 15 USD = 0.003 ETH (feeAmount must be gt relayFeeAmount)
            feeSwapPath: [ethUsdMarket.marketToken],
          },
          oracleParams: {
            tokens: [wnt.address, usdc.address],
            providers: [chainlinkPriceFeedProvider.address, chainlinkPriceFeedProvider.address],
            data: ["0x", "0x"],
          },
          account: user1.address,
          params: {
            markets: [ethUsdMarket.marketToken],
            tokens: [usdc.address],
            receiver: user1.address, // receiver must be the same as account to pay from the newly claimed tokens
          },
          deadline: 9999999999,
          srcChainId: chainId, // 0 means non-multichain action
          desChainId: chainId, // for non-multichain actions, desChainId is the same as chainId
          relayRouter: multichainClaimsRouter,
          chainId,
          relayFeeToken: wnt.address,
          relayFeeAmount: expandDecimals(2, 15), // 0.002 ETH
        };

        expect(await wnt.balanceOf(GELATO_RELAY_ADDRESS)).to.eq(0);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(0); // 0 ETH
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(0); // 0 USD

        await sendClaimFundingFees(createClaimParams);

        expect(await wnt.balanceOf(GELATO_RELAY_ADDRESS)).to.eq(expandDecimals(2, 15)); // 0.002 ETH relayFeeAmount
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(
          expandDecimals(1, 15)
        ); // 0.003 (equivalent of $15) - 0.002 = 0.001 ETH (received as residualFee)
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq("42600019"); // 42.600019 USD (received from claiming, after paying relay fee)
      });
    });

    describe("claimCollateral", () => {
      let timeKey: number;

      beforeEach(async () => {
        await dataStore.setUint(keys.positionImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(1, 7));
        await dataStore.setUint(keys.positionImpactExponentFactorKey(ethUsdMarket.marketToken), decimalToFloat(2, 0));
        await dataStore.setUint(keys.maxPositionImpactFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(1, 3));

        await handleOrder(fixture, {
          create: {
            account: user1,
            market: ethUsdMarket,
            initialCollateralToken: usdc,
            initialCollateralDeltaAmount: expandDecimals(50 * 1000, 6), // $50,000
            swapPath: [],
            sizeDeltaUsd: decimalToFloat(200 * 1000),
            acceptablePrice: expandDecimals(5200, 12),
            executionFee: expandDecimals(1, 15),
            minOutputAmount: 0,
            orderType: OrderType.MarketIncrease,
            isLong: true,
            shouldUnwrapNativeToken: false,
          },
        });
        await handleOrder(fixture, {
          create: {
            account: user1,
            market: ethUsdMarket,
            initialCollateralToken: usdc,
            initialCollateralDeltaAmount: expandDecimals(5 * 1000, 6), // $5,000
            swapPath: [],
            sizeDeltaUsd: decimalToFloat(20 * 1000),
            acceptablePrice: expandDecimals(4800, 12),
            executionFee: expandDecimals(1, 15),
            minOutputAmount: 0,
            orderType: OrderType.MarketDecrease,
            isLong: true,
            shouldUnwrapNativeToken: false,
          },
        });

        // allow 80% of collateral to be claimed
        timeKey = await getClaimableCollateralTimeKey();
        await dataStore.setUint(
          keys.claimableCollateralFactorKey(ethUsdMarket.marketToken, usdc.address, timeKey),
          decimalToFloat(8, 1)
        );
      });

      it("User receives collateral in his multichain balance, pays relay fee from his existing multicahin balance", async () => {
        // increase user's wnt multichain balance to pay for fees
        await mintAndBridge(fixture, { account: user1, token: wnt, tokenAmount: feeAmount });

        // the user will pay the relay fee from his newly claimed tokens
        const createClaimParams: Parameters<typeof sendClaimCollateral>[0] = {
          sender: relaySigner,
          signer: user1,
          feeParams: {
            feeToken: wnt.address, // user will use his existing wnt multichain balance to pay for fees
            feeAmount: feeAmount, // 15 USD = 0.003 ETH (feeAmount must be gt relayFeeAmount)
            feeSwapPath: [],
          },
          account: user1.address,
          params: {
            markets: [ethUsdMarket.marketToken],
            tokens: [usdc.address],
            timeKeys: [timeKey],
            receiver: user1.address,
          },
          deadline: 9999999999,
          srcChainId: chainId, // 0 means non-multichain action
          desChainId: chainId, // for non-multichain actions, desChainId is the same as chainId
          relayRouter: multichainClaimsRouter,
          chainId,
          relayFeeToken: wnt.address,
          relayFeeAmount: relayFeeAmount, // 0.002 ETH
        };

        expect(await wnt.balanceOf(GELATO_RELAY_ADDRESS)).to.eq(0);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(feeAmount); // 0.003 ETH
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(0); // 0 USD

        await sendClaimCollateral(createClaimParams);

        expect(await wnt.balanceOf(GELATO_RELAY_ADDRESS)).to.eq(relayFeeAmount); // 0.002 ETH
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(
          feeAmount.sub(relayFeeAmount)
        ); // 0.003 - 0.002 = 0.001 ETH (received as residualFee)
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(
          expandDecimals(304, 6)
        ); // 304 USD (received from claiming, relay fee was paid from existing wnt multichain balance)
      });

      it("User receives collateral in his multichain balance, pays relay fee from newly claimed tokens", async () => {
        // the user will pay the relay fee from his newly claimed usdc tokens
        const createClaimParams: Parameters<typeof sendClaimCollateral>[0] = {
          sender: relaySigner,
          signer: user1,
          feeParams: {
            feeToken: usdc.address, // user will use his newly claimed usdc to pay for fees
            feeAmount: expandDecimals(15, 6), // 15 USD = 0.003 ETH (feeAmount must be gt relayFeeAmount)
            feeSwapPath: [ethUsdMarket.marketToken],
          },
          oracleParams: {
            tokens: [wnt.address, usdc.address],
            providers: [chainlinkPriceFeedProvider.address, chainlinkPriceFeedProvider.address],
            data: ["0x", "0x"],
          },
          account: user1.address,
          params: {
            markets: [ethUsdMarket.marketToken],
            tokens: [usdc.address],
            timeKeys: [timeKey],
            receiver: user1.address, // receiver must be the same as account to pay from the newly claimed tokens
          },
          deadline: 9999999999,
          srcChainId: chainId, // 0 means non-multichain action
          desChainId: chainId, // for non-multichain actions, desChainId is the same as chainId
          relayRouter: multichainClaimsRouter,
          chainId,
          relayFeeToken: wnt.address,
          relayFeeAmount: expandDecimals(2, 15), // 0.002 ETH
        };

        expect(await wnt.balanceOf(GELATO_RELAY_ADDRESS)).to.eq(0);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(0); // 0 USD
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(0); // 0 USD

        await sendClaimCollateral(createClaimParams);

        expect(await wnt.balanceOf(GELATO_RELAY_ADDRESS)).to.eq(expandDecimals(2, 15)); // 0.002 ETH relayFeeAmount
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(
          expandDecimals(1, 15)
        ); // user1 receives the refundFee
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(
          expandDecimals(304, 6).sub(expandDecimals(15, 6))
        ); // claimable collateral is 304 USD, 15 USD is paid as relay fee from the newly claimed tokens
      });
    });

    describe("claimAffiliateRewards", () => {
      beforeEach(async () => {
        // Register referral code
        const code = hashData(["bytes32"], [hashString("CODE4")]);
        await referralStorage.connect(user1).registerCode(code);
        await referralStorage.setTier(1, 2000, 10000); // 20% discount code
        await referralStorage.connect(user1).setReferrerDiscountShare(5000); // 50% discount share
        await referralStorage.setReferrerTier(user1.address, 1);

        // Set 50 BIPs position fee
        await dataStore.setUint(keys.positionFeeFactorKey(ethUsdMarket.marketToken, false), decimalToFloat(5, 3));

        // User creates an order with this referral code
        await handleOrder(fixture, {
          create: {
            account: user0,
            market: ethUsdMarket,
            initialCollateralToken: usdc,
            initialCollateralDeltaAmount: expandDecimals(50_000, 6),
            swapPath: [],
            sizeDeltaUsd: decimalToFloat(50 * 1000), // Open $50,000 size
            acceptablePrice: expandDecimals(5000, 12),
            executionFee: expandDecimals(1, 15),
            minOutputAmount: 0,
            orderType: OrderType.MarketIncrease,
            isLong: true,
            shouldUnwrapNativeToken: false,
            referralCode: code,
          },
        });
      });

      it("Affiliate receives rewards in his multichain balance, pays relay fee from existing multichain balance", async () => {
        expect(
          await dataStore.getUint(keys.affiliateRewardKey(ethUsdMarket.marketToken, usdc.address, user1.address))
        ).to.eq(expandDecimals(25, 6)); // $25
        // increase affiliate's wnt multichain balance to pay for fees
        await mintAndBridge(fixture, { account: user1, token: wnt, tokenAmount: feeAmount });

        // affiliate will pay the relay fee from his existing wnt multichain balance
        const createClaimParams: Parameters<typeof sendClaimAffiliateRewards>[0] = {
          sender: relaySigner,
          signer: user1,
          feeParams: {
            feeToken: wnt.address, // user's multichain balance must have enough wnt to pay for fees
            feeAmount: feeAmount,
            feeSwapPath: [],
          },
          account: user1.address,
          params: {
            markets: [ethUsdMarket.marketToken],
            tokens: [usdc.address],
            receiver: user1.address,
          },
          deadline: 9999999999,
          srcChainId: chainId, // 0 means non-multichain action
          desChainId: chainId, // for non-multichain actions, desChainId is the same as chainId
          relayRouter: multichainClaimsRouter,
          chainId,
          relayFeeToken: wnt.address,
          relayFeeAmount: relayFeeAmount,
        };

        expect(await wnt.balanceOf(GELATO_RELAY_ADDRESS)).to.eq(0);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(feeAmount);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(0); // $0

        await sendClaimAffiliateRewards(createClaimParams);

        expect(await wnt.balanceOf(GELATO_RELAY_ADDRESS)).to.eq(relayFeeAmount);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(
          feeAmount.sub(relayFeeAmount)
        );
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(
          expandDecimals(25, 6)
        ); // $25
      });

      it("Affiliate receives rewards and residual fee in his multichain balance, pays relay fee from newly claimed tokens", async () => {
        expect(
          await dataStore.getUint(keys.affiliateRewardKey(ethUsdMarket.marketToken, usdc.address, user1.address))
        ).to.eq(expandDecimals(25, 6)); // $25

        // the user will pay the relay fee from his newly claimed tokens
        const createClaimParams: Parameters<typeof sendClaimAffiliateRewards>[0] = {
          sender: relaySigner,
          signer: user1,
          feeParams: {
            feeToken: usdc.address, // user will use his newly claimed usdc to pay for fees
            feeAmount: expandDecimals(15, 6), // 15 USD = 0.003 ETH (feeAmount must be gt relayFeeAmount)
            feeSwapPath: [ethUsdMarket.marketToken],
          },
          oracleParams: {
            tokens: [wnt.address, usdc.address],
            providers: [chainlinkPriceFeedProvider.address, chainlinkPriceFeedProvider.address],
            data: ["0x", "0x"],
          },
          account: user1.address,
          params: {
            markets: [ethUsdMarket.marketToken],
            tokens: [usdc.address],
            receiver: user1.address, // receiver must be the same as account to pay from the newly claimed tokens
          },
          deadline: 9999999999,
          srcChainId: chainId, // 0 means non-multichain action
          desChainId: chainId, // for non-multichain actions, desChainId is the same as chainId
          relayRouter: multichainClaimsRouter,
          chainId,
          relayFeeToken: wnt.address,
          relayFeeAmount: expandDecimals(2, 15), // 0.002 ETH
        };

        expect(await wnt.balanceOf(GELATO_RELAY_ADDRESS)).to.eq(0);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(0); // 0 ETH
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(0); // 0 USD

        await sendClaimAffiliateRewards(createClaimParams);

        expect(await wnt.balanceOf(GELATO_RELAY_ADDRESS)).to.eq(expandDecimals(2, 15)); // 0.002 ETH relayFeeAmount
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(
          expandDecimals(1, 15)
        ); // 0.003 (equivalent of $15) - 0.002 = 0.001 ETH (received as residualFee)
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(
          expandDecimals(10, 6)
        ); // 25 - 15 = 10 USD (received from claiming, after paying relay fee)
      });
    });
  });
});
