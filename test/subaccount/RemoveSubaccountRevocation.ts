// A removed subaccount holding a pre-signed SubaccountApproval could replay it
// to re-add itself and act on the owner's behalf. The DataStore revocation counter
// is committed into the approval digest, so any approval signed before the counter
// bump fails validation.
import { expect } from "chai";
import { impersonateAccount, setBalance, setNextBlockBaseFeePerGas } from "@nomicfoundation/hardhat-network-helpers";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { hashString } from "../../utils/hash";
import { OrderType, DecreasePositionSwapType, getOrderCount } from "../../utils/order";
import { errorsContract } from "../../utils/error";
import * as keys from "../../utils/keys";
import { getSubaccountApproval, sendCancelOrder, sendCreateOrder } from "../../utils/relay/subaccountGelatoRelay";
import { GELATO_RELAY_ADDRESS } from "../../utils/relay/addresses";
import { getTokenPermit } from "../../utils/relay/tokenPermit";
import { ethers } from "ethers";
import { handleDeposit } from "../../utils/deposit";
import { bridgeInTokens } from "../../utils/multichain";

describe("RemoveSubaccountRevocation", () => {
  let fixture;
  let user0, user1, user2, user3;
  let dataStore,
    router,
    subaccountRouter,
    subaccountGelatoRelayRouter,
    multichainSubaccountRouter,
    ethUsdMarket,
    wnt,
    usdc,
    mockStargatePoolNative,
    mockStargatePoolUsdc;
  let relaySigner;
  let chainId;
  const referralCode = hashString("referralCode");
  const integrationId = hashString("integrationId");

  let defaultCreateOrderParams;
  let createOrderParams: Parameters<typeof sendCreateOrder>[0];

  // Owner = user1, subaccount = user0 (matching existing relay test conventions).

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1, user2, user3 } = fixture.accounts);
    ({
      dataStore,
      router,
      subaccountRouter,
      subaccountGelatoRelayRouter,
      multichainSubaccountRouter,
      ethUsdMarket,
      wnt,
      usdc,
      mockStargatePoolNative,
      mockStargatePoolUsdc,
    } = fixture.contracts);

    await impersonateAccount(GELATO_RELAY_ADDRESS);
    await setBalance(GELATO_RELAY_ADDRESS, expandDecimals(100, 18));
    await usdc.mint(user1.address, expandDecimals(10000, 6));
    await wnt.connect(user1).deposit({ value: expandDecimals(1000, 18) });
    await dataStore.setUint(keys.MAX_RELAY_FEE_SWAP_USD, decimalToFloat(10000));
    await dataStore.setUint(keys.MAX_RELAY_FEE_SWAP_USD_FOR_SUBACCOUNT, decimalToFloat(100));

    relaySigner = await hre.ethers.getSigner(GELATO_RELAY_ADDRESS);
    chainId = await hre.ethers.provider.getNetwork().then((network) => network.chainId);
    await dataStore.setBool(keys.isSrcChainIdEnabledKey(chainId), true);
    await dataStore.setUint(keys.ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR, decimalToFloat(1));
    await setNextBlockBaseFeePerGas(expandDecimals(1, 9));

    defaultCreateOrderParams = {
      addresses: {
        receiver: user1.address,
        cancellationReceiver: user1.address,
        callbackContract: user2.address,
        uiFeeReceiver: user3.address,
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
      referralCode,
      dataList: [],
    };

    const tokenPermit = await getTokenPermit(wnt, user1, router.address, expandDecimals(1, 18), 0, 9999999999, chainId);

    createOrderParams = {
      sender: relaySigner,
      // signer is subaccount
      signer: user0,
      feeParams: {
        feeToken: wnt.address,
        feeAmount: expandDecimals(2, 15), // 0.002 ETH
        feeSwapPath: [],
      },
      tokenPermits: [tokenPermit],
      account: user1.address,
      subaccountApprovalSigner: user1,
      subaccount: user0.address,
      params: defaultCreateOrderParams,
      deadline: 9999999999,
      desChainId: chainId,
      relayRouter: subaccountGelatoRelayRouter,
      chainId,
      gelatoRelayFeeToken: wnt.address,
      gelatoRelayFeeAmount: expandDecimals(1, 15),
    };
  });

  // Pre-state that mimics a legitimately-active subaccount whose owner is about to revoke.
  async function seedActiveSubaccountState({
    expiresAt = 9999999999,
    maxAllowedCount = 10,
    actionCount = 0,
    autoTopUpAmount = 0,
    integration = integrationId,
  }: {
    expiresAt?: number;
    maxAllowedCount?: number;
    actionCount?: number;
    autoTopUpAmount?: ethers.BigNumberish;
    integration?: string;
  } = {}) {
    await dataStore.addAddress(keys.subaccountListKey(user1.address), user0.address);
    await dataStore.setUint(
      keys.subaccountExpiresAtKey(user1.address, user0.address, keys.SUBACCOUNT_ORDER_ACTION),
      expiresAt
    );
    await dataStore.setUint(
      keys.maxAllowedSubaccountActionCountKey(user1.address, user0.address, keys.SUBACCOUNT_ORDER_ACTION),
      maxAllowedCount
    );
    await dataStore.setUint(
      keys.subaccountActionCountKey(user1.address, user0.address, keys.SUBACCOUNT_ORDER_ACTION),
      actionCount
    );
    await dataStore.setUint(keys.subaccountAutoTopUpAmountKey(user1.address, user0.address), autoTopUpAmount);
    await dataStore.setBytes32(keys.subaccountIntegrationIdKey(user1.address, user0.address), integration);
    await wnt.connect(user1).approve(router.address, expandDecimals(100, 18));
  }

  function approvalPayload(overrides: Record<string, any> = {}) {
    return {
      subaccount: user0.address,
      shouldAdd: true,
      expiresAt: 9999999999,
      maxAllowedCount: 10,
      actionType: keys.SUBACCOUNT_ORDER_ACTION,
      deadline: 9999999999,
      integrationId,
      nonce: 0,
      ...overrides,
    };
  }

  it("zero-fields approval replay after removeSubaccount reverts at counter check", async () => {
    await seedActiveSubaccountState();

    // Owner (user1) calls non-relay removeSubaccount.
    await subaccountRouter.connect(user1).removeSubaccount(user0.address);

    // Attacker submits a relay createOrder with a zero-fields owner-signed approval.
    // The signed payload was created BEFORE the removal (counter=0); the on-chain
    // counter is now 1 post-removal, so the counter check rejects.
    // shouldAdd=true would re-insert the subaccount via the stale path if the check didn't fire.
    await expect(
      sendCreateOrder({
        ...createOrderParams,
        subaccountApproval: approvalPayload({
          // zero-fields shape: rely on stale storage
          expiresAt: 0,
          maxAllowedCount: 0,
          revocationCounter: 0, // pre-signed against the pre-removal counter
        }),
      })
    ).to.be.revertedWithCustomError(errorsContract, "InvalidSubaccountApprovalRevocationCounter");
  });

  it("non-zero approval replay after removeSubaccount reverts at counter check", async () => {
    await seedActiveSubaccountState();
    await subaccountRouter.connect(user1).removeSubaccount(user0.address);

    await expect(
      sendCreateOrder({
        ...createOrderParams,
        // non-zero approval would rewrite just-cleared slots if the counter check didn't fire
        subaccountApproval: approvalPayload({ revocationCounter: 0 }),
      })
    ).to.be.revertedWithCustomError(errorsContract, "InvalidSubaccountApprovalRevocationCounter");
  });

  it("cancelOrder variant of non-zero replay reverts at counter check", async () => {
    await seedActiveSubaccountState({ actionCount: 0 });
    await usdc.connect(user1).approve(router.address, expandDecimals(1000, 6));

    // No real order needed — cancelOrder reverts at the counter check before reaching order lookup.
    const fakeOrderKey = ethers.utils.formatBytes32String("not-a-real-order");

    await subaccountRouter.connect(user1).removeSubaccount(user0.address);

    await expect(
      sendCancelOrder({
        sender: relaySigner,
        signer: user0,
        subaccountApprovalSigner: user1,
        feeParams: createOrderParams.feeParams,
        tokenPermits: createOrderParams.tokenPermits,
        account: user1.address,
        subaccount: user0.address,
        key: fakeOrderKey,
        chainId,
        deadline: 9999999999,
        desChainId: chainId,
        relayRouter: subaccountGelatoRelayRouter,
        gelatoRelayFeeToken: wnt.address,
        gelatoRelayFeeAmount: expandDecimals(1, 15),
        subaccountApproval: approvalPayload({ revocationCounter: 0 }),
      })
    ).to.be.revertedWithCustomError(errorsContract, "InvalidSubaccountApprovalRevocationCounter");
  });

  it("removeSubaccount via on-chain SubaccountRouter invalidates approvals on both relay routers", async () => {
    await seedActiveSubaccountState();
    // Multichain bridge setup so the multichain side has tokens & enabled config.
    await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolNative.address), true);
    await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolNative.address), true);
    await bridgeInTokens(fixture, { account: user1, amount: expandDecimals(10, 18) });
    await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolUsdc.address), true);
    await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolUsdc.address), true);

    // Owner removes via the non-relay path; both relay routers should now see the bumped counter.
    await subaccountRouter.connect(user1).removeSubaccount(user0.address);

    // Attempt #1: replay via SubaccountGelatoRelayRouter.
    await expect(
      sendCreateOrder({
        ...createOrderParams,
        subaccountApproval: approvalPayload({ revocationCounter: 0 }),
      })
    ).to.be.revertedWithCustomError(errorsContract, "InvalidSubaccountApprovalRevocationCounter");

    // Attempt #2: replay via MultichainSubaccountRouter.
    await expect(
      sendCreateOrder({
        ...createOrderParams,
        relayRouter: multichainSubaccountRouter,
        srcChainId: chainId,
        feeParams: {
          feeToken: wnt.address,
          feeAmount: expandDecimals(2, 15),
          feeSwapPath: [],
        },
        tokenPermits: [], // multichain uses bridged balance, not permits
        subaccountApproval: approvalPayload({ revocationCounter: 0 }),
      })
    ).to.be.revertedWithCustomError(errorsContract, "InvalidSubaccountApprovalRevocationCounter");
  });

  it("approval signed for SubaccountGelatoRelayRouter cannot be replayed on MultichainSubaccountRouter", async () => {
    await seedActiveSubaccountState();
    await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolNative.address), true);
    await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolNative.address), true);
    await bridgeInTokens(fixture, { account: user1, amount: expandDecimals(10, 18) });

    // Pre-sign against subaccountGelatoRelayRouter, then submit on multichainSubaccountRouter.
    // The two routers have different domain separators, so ECDSA recovery returns the wrong
    // signer --> InvalidRecoveredSigner.
    const approvalForRelay = await getSubaccountApproval({
      subaccountApproval: approvalPayload(),
      desChainId: chainId,
      account: user1.address,
      relayRouter: subaccountGelatoRelayRouter,
      chainId,
      signer: user1,
    });

    // Now submit on multichainSubaccountRouter with the relay-router-bound signature.
    await expect(
      sendCreateOrder({
        ...createOrderParams,
        relayRouter: multichainSubaccountRouter,
        srcChainId: chainId,
        feeParams: {
          feeToken: wnt.address,
          feeAmount: expandDecimals(2, 15),
          feeSwapPath: [],
        },
        tokenPermits: [],
        // pre-signed for the wrong router
        subaccountApproval: approvalPayload({ signature: approvalForRelay.signature }),
      })
    ).to.be.revertedWithCustomError(errorsContract, "InvalidRecoveredSigner");
  });

  it("legitimate re-add after removeSubaccount with bumped counter succeeds", async () => {
    await seedActiveSubaccountState();
    await subaccountRouter.connect(user1).removeSubaccount(user0.address);

    await sendCreateOrder({
      ...createOrderParams,
      // revocationCounter omitted --> helper resolves it from DataStore (auto-fresh)
      subaccountApproval: approvalPayload(),
    });

    // Subaccount is back in the set.
    expect(await dataStore.containsAddress(keys.subaccountListKey(user1.address), user0.address)).to.eq(true);
    expect(await getOrderCount(dataStore)).to.eq(1);
  });

  it("after legitimate re-add, empty-signature relay calls proceed until maxAllowedCount cap", async () => {
    // Seed pre-state with a low cap so we can easily hit MaxSubaccountActionCountExceeded.
    await seedActiveSubaccountState({ maxAllowedCount: 2 });
    await subaccountRouter.connect(user1).removeSubaccount(user0.address);

    // Legitimate re-add (one approval, single use). Bumps action count to 1.
    await sendCreateOrder({
      ...createOrderParams,
      subaccountApproval: approvalPayload({ maxAllowedCount: 2 }),
    });

    // Follow-up with empty signature (skips approval block) — counts as action 2.
    await sendCreateOrder({
      ...createOrderParams,
      userNonce: 1,
      // No subaccountApproval --> helper returns getEmptySubaccountApproval() (signature.length == 0)
    });

    // Third action would hit cap; reverts with MaxSubaccountActionCountExceeded.
    await expect(
      sendCreateOrder({
        ...createOrderParams,
        userNonce: 2,
      })
    ).to.be.revertedWithCustomError(errorsContract, "MaxSubaccountActionCountExceeded");
  });

  it("removeSubaccount clears the 4 target slots and preserves integrationId", async () => {
    await seedActiveSubaccountState({
      expiresAt: 9999999999,
      maxAllowedCount: 10,
      actionCount: 3,
      autoTopUpAmount: expandDecimals(2, 17),
      integration: integrationId,
    });

    // Pre-state sanity (the slots are non-zero).
    expect(
      await dataStore.getUint(keys.subaccountExpiresAtKey(user1.address, user0.address, keys.SUBACCOUNT_ORDER_ACTION))
    ).to.eq(9999999999);
    expect(
      await dataStore.getUint(
        keys.maxAllowedSubaccountActionCountKey(user1.address, user0.address, keys.SUBACCOUNT_ORDER_ACTION)
      )
    ).to.eq(10);
    expect(
      await dataStore.getUint(keys.subaccountActionCountKey(user1.address, user0.address, keys.SUBACCOUNT_ORDER_ACTION))
    ).to.eq(3);
    expect(await dataStore.getUint(keys.subaccountAutoTopUpAmountKey(user1.address, user0.address))).to.eq(
      expandDecimals(2, 17)
    );
    expect(await dataStore.getBytes32(keys.subaccountIntegrationIdKey(user1.address, user0.address))).to.eq(
      integrationId
    );
    expect(await dataStore.getUint(keys.subaccountRevocationCounterKey(user1.address, user0.address))).to.eq(0);

    await subaccountRouter.connect(user1).removeSubaccount(user0.address);

    // Post-state: 4 slots cleared.
    expect(
      await dataStore.getUint(keys.subaccountExpiresAtKey(user1.address, user0.address, keys.SUBACCOUNT_ORDER_ACTION))
    ).to.eq(0);
    expect(
      await dataStore.getUint(
        keys.maxAllowedSubaccountActionCountKey(user1.address, user0.address, keys.SUBACCOUNT_ORDER_ACTION)
      )
    ).to.eq(0);
    expect(
      await dataStore.getUint(keys.subaccountActionCountKey(user1.address, user0.address, keys.SUBACCOUNT_ORDER_ACTION))
    ).to.eq(0);
    expect(await dataStore.getUint(keys.subaccountAutoTopUpAmountKey(user1.address, user0.address))).to.eq(0);

    // integrationId preserved so the integration-disable defense survives re-add.
    expect(await dataStore.getBytes32(keys.subaccountIntegrationIdKey(user1.address, user0.address))).to.eq(
      integrationId
    );

    expect(await dataStore.getUint(keys.subaccountRevocationCounterKey(user1.address, user0.address))).to.eq(1);
  });

  it("integrationId-disabled defense survives removeSubaccount and legitimate re-add", async () => {
    await seedActiveSubaccountState({ integration: integrationId });

    // Disable the integrationId globally (the integration-disable defense).
    await dataStore.setBool(keys.subaccountIntegrationDisabledKey(integrationId), true);

    await subaccountRouter.connect(user1).removeSubaccount(user0.address);

    // Owner signs a fresh counter-aware approval and re-adds.
    // The createOrder action will reach validateIntegrationId, which reads the
    // preserved integrationId and finds it globally disabled.
    await expect(
      sendCreateOrder({
        ...createOrderParams,
        subaccountApproval: approvalPayload(),
      })
    ).to.be.revertedWithCustomError(errorsContract, "SubaccountIntegrationIdDisabled");
  });

  it("action-count clearing does not produce a fresh-budget regression because counter blocks replay", async () => {
    // Pre-state: action count near the cap. Without the counter check, clearing the
    // count on removal would hand the attacker a fresh full budget on replay.
    await seedActiveSubaccountState({ maxAllowedCount: 10, actionCount: 9 });
    await subaccountRouter.connect(user1).removeSubaccount(user0.address);

    await expect(
      sendCreateOrder({
        ...createOrderParams,
        subaccountApproval: approvalPayload({ revocationCounter: 0 }), // stale
      })
    ).to.be.revertedWithCustomError(errorsContract, "InvalidSubaccountApprovalRevocationCounter");
  });

  it("non-SUBACCOUNT_ORDER_ACTION actionType slot survives removeSubaccount", async () => {
    const OTHER_ACTION_TYPE = hashString("HYPOTHETICAL_FUTURE_ACTION");

    await seedActiveSubaccountState();
    // Owner writes to the non-default actionType slot via the on-chain SubaccountRouter.
    await subaccountRouter.connect(user1).setSubaccountExpiresAt(user0.address, OTHER_ACTION_TYPE, 9999999999);
    expect(await dataStore.getUint(keys.subaccountExpiresAtKey(user1.address, user0.address, OTHER_ACTION_TYPE))).to.eq(
      9999999999
    );

    await subaccountRouter.connect(user1).removeSubaccount(user0.address);

    // removeSubaccount only clears slots for wired actionTypes; arbitrary non-wired
    // actionTypes (like this one) survive. The counter check makes the latent state unreachable.
    expect(await dataStore.getUint(keys.subaccountExpiresAtKey(user1.address, user0.address, OTHER_ACTION_TYPE))).to.eq(
      9999999999
    );
  });

  it("auto-top-up after legitimate re-add is bounded by min(storedAmount, gasUsed + executionFee)", async () => {
    await seedActiveSubaccountState();
    await subaccountRouter.connect(user1).removeSubaccount(user0.address);
    await sendCreateOrder({
      ...createOrderParams,
      subaccountApproval: approvalPayload(),
    });

    // Owner sets an auto-top-up amount LARGER than realistic gasUsed + executionFee.
    // Then the subaccount triggers a non-relay action via SubaccountRouter
    // (msg.sender = subaccount), which flows through _autoTopUpSubaccount.
    // The transfer should be capped by min(storedAmount, gasUsed + executionFee),
    // NOT just storedAmount.
    const largeTopUp = expandDecimals(1, 18); // 1 ETH, much larger than per-call gas+executionFee
    const executionFee = expandDecimals(1, 17); // 0.1 ETH
    await subaccountRouter.connect(user1).setSubaccountAutoTopUpAmount(user0.address, largeTopUp);

    // Owner approves router for WNT pluginTransfer (collateral + top-up source).
    await wnt.connect(user1).approve(router.address, expandDecimals(100, 18));

    // Market needs liquidity so the createOrder is accepted.
    await handleDeposit(fixture, {
      create: {
        longTokenAmount: expandDecimals(10, 18),
        shortTokenAmount: expandDecimals(10 * 5000, 6),
      },
    });

    // Required by GasUtils.transferExcessiveExecutionFee on order creation.
    await dataStore.setAddress(keys.HOLDING_ADDRESS, user2.address);

    // Subaccount needs native ETH to wrap into WNT for the executionFee.
    await setBalance(user0.address, expandDecimals(10, 18));

    const orderVault = fixture.contracts.orderVault;
    const params = {
      ...defaultCreateOrderParams,
      addresses: {
        ...defaultCreateOrderParams.addresses,
        receiver: user1.address,
        cancellationReceiver: user1.address,
        initialCollateralToken: ethUsdMarket.longToken,
        swapPath: [],
      },
      numbers: {
        ...defaultCreateOrderParams.numbers,
        executionFee,
      },
      orderType: OrderType.MarketIncrease,
    };

    const ownerWntBefore = await wnt.balanceOf(user1.address);

    // Subaccount sends native ETH equal to executionFee; sendWnt wraps + forwards to orderVault.
    // createOrder then pluginTransfers initialCollateralDeltaAmount from owner to orderVault
    // and emits + records the order. _autoTopUpSubaccount runs at the tail and transfers
    // bounded WNT back to the subaccount.
    await subaccountRouter
      .connect(user0)
      .multicall(
        [
          subaccountRouter.interface.encodeFunctionData("sendWnt", [orderVault.address, executionFee]),
          subaccountRouter.interface.encodeFunctionData("createOrder", [user1.address, params]),
        ],
        { value: executionFee }
      );

    const ownerWntAfter = await wnt.balanceOf(user1.address);
    const ownerWntDelta = ownerWntBefore.sub(ownerWntAfter);

    // owner's WNT delta = initialCollateralDeltaAmount (sent to orderVault) + topUpAmount.
    // initialCollateralDeltaAmount comes from defaultCreateOrderParams = 0.1 ETH.
    // Top-up = ownerWntDelta - initialCollateralDeltaAmount.
    const collateral = ethers.BigNumber.from(defaultCreateOrderParams.numbers.initialCollateralDeltaAmount);
    const topUpTransferred = ownerWntDelta.sub(collateral);

    // Top-up is positive but smaller than the stored amount (capped by gas+executionFee).
    expect(topUpTransferred).to.be.lt(largeTopUp);
    expect(topUpTransferred).to.be.gt(0);
    // 0.2 ETH is well above gas+executionFee for a single createOrder call at 1 gwei base fee.
    expect(topUpTransferred).to.be.lt(expandDecimals(2, 17));
  });
});
