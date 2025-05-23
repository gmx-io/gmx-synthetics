import { expect } from "chai";
import { impersonateAccount, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { decimalToFloat, expandDecimals } from "../../utils/math";
import { deployFixture } from "../../utils/fixture";
import { GELATO_RELAY_ADDRESS } from "../../utils/relay/addresses";
import { sendBatch, sendCancelOrder, sendCreateOrder, sendUpdateOrder } from "../../utils/relay/gelatoRelay";
import * as keys from "../../utils/keys";
import { handleDeposit } from "../../utils/deposit";
import { DecreasePositionSwapType, executeOrder, getOrderCount, getOrderKeys, OrderType } from "../../utils/order";
import { hashString } from "../../utils/hash";
import { getPositionCount } from "../../utils/position";
import { expectBalance } from "../../utils/validation";
import { executeLiquidation } from "../../utils/liquidation";
import { executeAdl, updateAdlState } from "../../utils/adl";
import { mintAndBridge } from "../../utils/multichain";

describe("MultichainOrderRouter", () => {
  let fixture;
  let user0, user1, user2;
  let reader,
    dataStore,
    multichainOrderRouter,
    ethUsdMarket,
    wethPriceFeed,
    wnt,
    usdc,
    mockStargatePoolUsdc,
    mockStargatePoolWnt;
  let relaySigner;
  let chainId;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1, user2 } = fixture.accounts);
    ({
      reader,
      dataStore,
      multichainOrderRouter,
      ethUsdMarket,
      wethPriceFeed,
      wnt,
      usdc,
      mockStargatePoolUsdc,
      mockStargatePoolWnt,
    } = fixture.contracts);

    await impersonateAccount(GELATO_RELAY_ADDRESS);
    await setBalance(GELATO_RELAY_ADDRESS, expandDecimals(1, 16)); // ETH to pay tx fees

    relaySigner = await hre.ethers.getSigner(GELATO_RELAY_ADDRESS);
    chainId = await hre.ethers.provider.getNetwork().then((network) => network.chainId);

    await dataStore.setBool(keys.isSrcChainIdEnabledKey(chainId), true);

    await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolWnt.address), true);
    await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolWnt.address), true);

    await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolUsdc.address), true);
    await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolUsdc.address), true);
  });

  const collateralDeltaAmount = expandDecimals(1, 18); // 1 ETH
  const executionFee = expandDecimals(4, 15); // 0.004 ETH
  const relayFeeAmount = expandDecimals(2, 15); // 0.002 ETH
  const feeAmount = executionFee.add(relayFeeAmount); // 0.006 ETH

  let defaultOrderParams;
  let createOrderParams: Parameters<typeof sendCreateOrder>[0];
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
    const ethAmount = expandDecimals(10, 18);
    const usdcAmount = expandDecimals(10 * 5000, 6);

    // deposit required to execute orders
    beforeEach(async () => {
      await handleDeposit(fixture, {
        create: {
          longTokenAmount: ethAmount,
          shortTokenAmount: usdcAmount,
        },
      });
    });

    it("creates multichain order and sends relayer fee", async () => {
      // enable keeper fee payment
      await dataStore.setUint(keys.EXECUTION_GAS_FEE_MULTIPLIER_FACTOR, decimalToFloat(1));

      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(0);
      expect(await wnt.balanceOf(GELATO_RELAY_ADDRESS)).to.eq(0);

      await mintAndBridge(fixture, { account: user1, token: wnt, tokenAmount: collateralDeltaAmount.add(feeAmount) });

      expect(await getOrderCount(dataStore)).to.eq(0);
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(
        collateralDeltaAmount.add(feeAmount)
      );

      await sendCreateOrder(createOrderParams);

      expect(await getOrderCount(dataStore)).to.eq(1);
      expect(await getPositionCount(dataStore)).to.eq(0);
      expect(await wnt.balanceOf(GELATO_RELAY_ADDRESS)).to.eq(relayFeeAmount);
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(0);

      await executeOrder(fixture, { gasUsageLabel: "executeOrder" });

      expect(await getOrderCount(dataStore)).to.eq(0);
      expect(await getPositionCount(dataStore)).to.eq(1);
      // execution fee is ~0.002113 ETH and the excess is returned to user's multichain balance
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).closeTo(
        "1887854983102840",
        expandDecimals(1, 12)
      ); // 0.004 - ~0.002113 = ~0.001887 ETH
    });

    it("liquidation increases user's multichain balance", async () => {
      // order is created from a source chain
      await mintAndBridge(fixture, {
        account: user1,
        token: wnt,
        tokenAmount: collateralDeltaAmount.add(feeAmount),
      });
      await sendCreateOrder(createOrderParams);
      await executeOrder(fixture, { gasUsageLabel: "executeOrder" });

      // forcing liquidation
      await dataStore.setUint(
        keys.minCollateralFactorForLiquidationKey(ethUsdMarket.marketToken),
        expandDecimals(1, 30)
      );

      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(executionFee); // keeper not enabled, entire executionFee returned

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
        collateralDeltaAmount.add(executionFee)
      );
    });

    it("adl increases user's multichain balance", async () => {
      // order is created from a source chain
      await mintAndBridge(fixture, {
        account: user1,
        token: wnt,
        tokenAmount: collateralDeltaAmount.add(feeAmount),
      });
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(
        collateralDeltaAmount.add(feeAmount)
      ); // 1 ETH + 0.006 ETH
      await sendCreateOrder(createOrderParams);
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(0);
      await executeOrder(fixture, { gasUsageLabel: "executeOrder" });
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(executionFee); // keeper not enabled, entire executionFee returned

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

      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(executionFee);

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
        executionFee.add(collateralDeltaAmount)
      );
    });

    it("refunds multichain execution fee", async () => {
      // enable keeper fee payment
      await dataStore.setUint(keys.EXECUTION_GAS_FEE_MULTIPLIER_FACTOR, decimalToFloat(1));
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(0);

      await mintAndBridge(fixture, { account: user1, token: wnt, tokenAmount: collateralDeltaAmount.add(feeAmount) });
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(
        collateralDeltaAmount.add(feeAmount)
      );

      await sendCreateOrder({ ...createOrderParams });
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(0);

      await executeOrder(fixture, { gasUsageLabel: "executeOrder" });
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).closeTo(
        "1887856983102856",
        expandDecimals(1, 12)
      ); // ~ 0.001887 ETH
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
      await mintAndBridge(fixture, { account: user1, token: wnt, tokenAmount: collateralDeltaAmount.add(feeAmount) });
      expect(await wnt.balanceOf(GELATO_RELAY_ADDRESS)).to.eq(0);

      await sendCreateOrder(createOrderParams);

      expect(await wnt.balanceOf(GELATO_RELAY_ADDRESS)).to.eq(relayFeeAmount);
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(0);

      const orderKeys = await getOrderKeys(dataStore, 0, 1);
      let order = await reader.getOrder(dataStore.address, orderKeys[0]);
      expect(order.numbers.sizeDeltaUsd).eq(decimalToFloat(25000));
      expect(order.numbers.acceptablePrice).eq(decimalToFloat(4900));
      expect(order.numbers.triggerPrice).eq(decimalToFloat(4800));
      expect(order.numbers.minOutputAmount).eq(700);
      expect(order.numbers.validFromTime).eq(0);
      expect(order.flags.autoCancel).eq(false);

      // relayFeeAmount was paid to create order, top-up relayFeeAmount for update order
      await mintAndBridge(fixture, { account: user1, token: wnt, tokenAmount: relayFeeAmount });

      await sendUpdateOrder({ ...updateOrderParams, params: { ...updateOrderParams.params, key: orderKeys[0] } });

      order = await reader.getOrder(dataStore.address, orderKeys[0]);
      expect(order.numbers.sizeDeltaUsd).eq(decimalToFloat(1));
      expect(order.numbers.acceptablePrice).eq(decimalToFloat(2));
      expect(order.numbers.triggerPrice).eq(decimalToFloat(3));
      expect(order.numbers.minOutputAmount).eq(4);
      expect(order.numbers.validFromTime).eq(5);
      expect(order.flags.autoCancel).eq(true);
      // relayFeeAmount was paid twice in total: once for create order and once for update order
      await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, relayFeeAmount.mul(2));
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(0);
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
      await mintAndBridge(fixture, {
        account: user1,
        token: wnt,
        tokenAmount: collateralDeltaAmount.add(feeAmount),
      });
      await sendCreateOrder(createOrderParams);
      expect(await wnt.balanceOf(GELATO_RELAY_ADDRESS)).to.eq(relayFeeAmount);

      const orderKeys = await getOrderKeys(dataStore, 0, 1);
      expect(await getOrderCount(dataStore)).to.eq(1);
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(0);

      await mintAndBridge(fixture, {
        account: user1,
        token: wnt,
        tokenAmount: relayFeeAmount,
      });
      // relayFeeAmount was paid to create order, top-up relayFeeAmount for cancel order
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(relayFeeAmount);

      await sendCancelOrder({ ...cancelOrderParams, key: orderKeys[0] });

      expect(await getOrderCount(dataStore)).to.eq(0);
      await expectBalance(wnt.address, GELATO_RELAY_ADDRESS, relayFeeAmount.mul(2));
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(
        collateralDeltaAmount.add(executionFee)
      ); // 1.00 + 0.004 (keeper did not execute the order --> executionFee returned) = 1.004 ETH
    });
  });

  describe("batch", () => {
    let batchParams: Parameters<typeof sendBatch>[0];

    beforeEach(async () => {
      batchParams = {
        sender: relaySigner,
        signer: user1,
        feeParams: {
          feeToken: wnt.address,
          feeAmount: 0,
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
        gelatoRelayFeeAmount: relayFeeAmount, // 0.002 ETH
      };
    });

    it("batch: creates multichain orders", async () => {
      const batchFeeAmount = executionFee.mul(2).add(relayFeeAmount); // 0.004 * 2 + 0.002 = 0.01 ETH
      await mintAndBridge(fixture, {
        account: user1,
        token: wnt,
        tokenAmount: collateralDeltaAmount.mul(2).add(batchFeeAmount),
      });
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(
        collateralDeltaAmount.mul(2).add(batchFeeAmount)
      );

      expect(await wnt.balanceOf(GELATO_RELAY_ADDRESS)).to.eq(0);
      batchParams.feeParams.feeAmount = batchFeeAmount;
      batchParams.createOrderParamsList = [defaultOrderParams, defaultOrderParams];
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

      expect(await wnt.balanceOf(GELATO_RELAY_ADDRESS)).eq(relayFeeAmount);
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(0);
    });
  });
});
