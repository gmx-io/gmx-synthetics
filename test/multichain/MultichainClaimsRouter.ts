import { expect } from "chai";
import { impersonateAccount, setBalance, time } from "@nomicfoundation/hardhat-network-helpers";

import { decimalToFloat, expandDecimals } from "../../utils/math";
import { deployFixture } from "../../utils/fixture";
import { GELATO_RELAY_ADDRESS } from "../../utils/relay/addresses";
import { sendClaimAffiliateRewards, sendClaimFundingFees, sendClaimCollateral } from "../../utils/relay/multichain";
import * as keys from "../../utils/keys";
import { handleDeposit } from "../../utils/deposit";
import { handleOrder, OrderType } from "../../utils/order";
import { hashData, hashString } from "../../utils/hash";
import { getClaimableCollateralTimeKey } from "../../utils/collateral";
import { bridgeInTokens } from "../../utils/multichain";
import { errorsContract } from "../../utils/error";
import { getRelayParams } from "../../utils/relay/helpers";
import { getClaimCollateralSignature, getClaimFundingFeesSignature } from "../../utils/relay/signatures";

describe("MultichainClaimsRouter", () => {
  let fixture;
  let user0, user1, user2;
  let dataStore,
    ethUsdMarket,
    wnt,
    usdc,
    chainlinkPriceFeedProvider,
    multichainClaimsRouter,
    mockStargatePoolUsdc,
    mockStargatePoolNative,
    referralStorage;
  let relaySigner;
  let chainId;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1, user2 } = fixture.accounts);
    ({
      dataStore,
      ethUsdMarket,
      wnt,
      usdc,
      chainlinkPriceFeedProvider,
      multichainClaimsRouter,
      mockStargatePoolUsdc,
      mockStargatePoolNative,
      referralStorage,
    } = fixture.contracts);

    await impersonateAccount(GELATO_RELAY_ADDRESS);
    await setBalance(GELATO_RELAY_ADDRESS, expandDecimals(1, 16)); // ETH to pay tx fees

    relaySigner = await hre.ethers.getSigner(GELATO_RELAY_ADDRESS);
    chainId = await hre.ethers.provider.getNetwork().then((network) => network.chainId);

    await dataStore.setBool(keys.isSrcChainIdEnabledKey(chainId), true);

    await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolNative.address), true);
    await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolUsdc.address), true);

    await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolNative.address), true);
    await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolUsdc.address), true);
  });

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

    let createClaimParams: Parameters<typeof sendClaimFundingFees>[0];
    beforeEach(async () => {
      // the user will pay the relay fee from his newly claimed tokens
      createClaimParams = {
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
    });

    it("User receives funding fees in his multichain balance, pays relay fee from existing multichain balance", async () => {
      // increase user's wnt multichain balance to pay for fees
      await bridgeInTokens(fixture, { account: user1, amount: feeAmount });

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
      createClaimParams.feeParams = {
        feeToken: usdc.address, // user will use his newly claimed usdc to pay for fees
        feeAmount: expandDecimals(15, 6), // 15 USD = 0.003 ETH (feeAmount must be gt relayFeeAmount)
        feeSwapPath: [ethUsdMarket.marketToken],
      };
      createClaimParams.oracleParams = {
        tokens: [wnt.address, usdc.address],
        providers: [chainlinkPriceFeedProvider.address, chainlinkPriceFeedProvider.address],
        data: ["0x", "0x"],
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

    it("should revert if signature is invalid due to incorrect signer", async () => {
      createClaimParams.signer = user2; // incorrect signer
      await expect(sendClaimFundingFees(createClaimParams)).to.be.revertedWithCustomError(
        errorsContract,
        "InvalidRecoveredSigner"
      );

      createClaimParams.signer = user1; // correct signer
      await bridgeInTokens(fixture, { account: user1, amount: feeAmount });
      await expect(sendClaimFundingFees(createClaimParams)).to.not.be.reverted;
    });

    it("should transfer WNT to relayer for relay fee", async () => {
      const relayInitial = await wnt.balanceOf(GELATO_RELAY_ADDRESS);
      await bridgeInTokens(fixture, { account: user1, amount: feeAmount });
      await sendClaimFundingFees(createClaimParams);
      const relayFinal = await wnt.balanceOf(GELATO_RELAY_ADDRESS);
      expect(relayFinal.sub(relayInitial)).eq(relayFeeAmount);
    });

    it("should revert if deadline has passed", async () => {
      createClaimParams.deadline = 1; // past deadline
      await expect(sendClaimFundingFees(createClaimParams)).to.be.revertedWithCustomError(
        errorsContract,
        "DeadlinePassed"
      );

      createClaimParams.deadline = 9999999999; // future deadline
      await bridgeInTokens(fixture, { account: user1, amount: feeAmount });
      await expect(sendClaimFundingFees(createClaimParams)).to.not.be.reverted;
    });

    it("should revert if any data in params is tampered", async () => {
      createClaimParams.userNonce = 1; // set value upfront to have the same user nonce for relayParams here and when recalculated in sendClaimFundingFees
      const relayParams = await getRelayParams(createClaimParams);
      const signature = await getClaimFundingFeesSignature({
        ...createClaimParams,
        relayParams,
        verifyingContract: createClaimParams.relayRouter.address,
      });
      createClaimParams.signature = signature;

      createClaimParams.deadline = 9999999998; // tamper a param field
      await bridgeInTokens(fixture, { account: user1, amount: feeAmount });
      await expect(sendClaimFundingFees(createClaimParams)).to.be.revertedWithCustomError(
        errorsContract,
        "InvalidRecoveredSigner"
      );

      createClaimParams.deadline = 9999999999; // use the original value again
      await expect(sendClaimFundingFees(createClaimParams)).to.not.be.reverted;
    });

    it("should revert if fee cannot be covered", async () => {
      await expect(sendClaimFundingFees(createClaimParams)).to.be.revertedWithCustomError(
        errorsContract,
        "InsufficientMultichainBalance"
      );

      await bridgeInTokens(fixture, { account: user1, amount: feeAmount });
      await sendClaimFundingFees(createClaimParams); //).to.not.be.reverted;
    });

    it("should revert if same params are reused (simulate replay)", async () => {
      createClaimParams.userNonce = 1; // set value upfront to have the same user nonce for relayParams here and when recalculated in sendClaimFundingFees
      const relayParams = await getRelayParams(createClaimParams);
      const signature = await getClaimFundingFeesSignature({
        ...createClaimParams,
        relayParams,
        verifyingContract: createClaimParams.relayRouter.address,
      });
      createClaimParams.signature = signature;
      await bridgeInTokens(fixture, { account: user1, amount: feeAmount });
      await sendClaimFundingFees(createClaimParams);

      // reuse exact same params and signature
      await bridgeInTokens(fixture, { account: user1, amount: feeAmount });
      await expect(sendClaimFundingFees(createClaimParams)).to.be.revertedWithCustomError(
        errorsContract,
        "InvalidUserDigest"
      );

      // reset nonce and signature (sendClaimFundingFees will recalculate them)
      createClaimParams.userNonce = undefined;
      createClaimParams.signature = undefined;
      await expect(sendClaimFundingFees(createClaimParams)).to.not.be.reverted;
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

    let createClaimParams: Parameters<typeof sendClaimCollateral>[0];
    beforeEach(async () => {
      // the user will pay the relay fee from his newly claimed tokens
      createClaimParams = {
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
    });

    it("User receives collateral in his multichain balance, pays relay fee from his existing multicahin balance", async () => {
      // increase user's wnt multichain balance to pay for fees
      await bridgeInTokens(fixture, { account: user1, amount: feeAmount });

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
      createClaimParams.feeParams = {
        feeToken: usdc.address, // user will use his newly claimed usdc to pay for fees
        feeAmount: expandDecimals(15, 6), // 15 USD = 0.003 ETH (feeAmount must be gt relayFeeAmount)
        feeSwapPath: [ethUsdMarket.marketToken],
      };
      createClaimParams.oracleParams = {
        tokens: [wnt.address, usdc.address],
        providers: [chainlinkPriceFeedProvider.address, chainlinkPriceFeedProvider.address],
        data: ["0x", "0x"],
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

    it("should revert if signature is invalid due to incorrect signer", async () => {
      createClaimParams.signer = user2; // incorrect signer
      await expect(sendClaimCollateral(createClaimParams)).to.be.revertedWithCustomError(
        errorsContract,
        "InvalidRecoveredSigner"
      );

      createClaimParams.signer = user1; // correct signer
      await bridgeInTokens(fixture, { account: user1, amount: feeAmount });
      await expect(sendClaimCollateral(createClaimParams)).to.not.be.reverted;
    });

    it("should transfer WNT to relayer for relay fee", async () => {
      const relayInitial = await wnt.balanceOf(GELATO_RELAY_ADDRESS);
      await bridgeInTokens(fixture, { account: user1, amount: feeAmount });
      await sendClaimCollateral(createClaimParams);
      const relayFinal = await wnt.balanceOf(GELATO_RELAY_ADDRESS);
      expect(relayFinal.sub(relayInitial)).eq(relayFeeAmount);
    });

    it("should revert if deadline has passed", async () => {
      createClaimParams.deadline = 1; // past deadline
      await expect(sendClaimCollateral(createClaimParams)).to.be.revertedWithCustomError(
        errorsContract,
        "DeadlinePassed"
      );

      createClaimParams.deadline = 9999999999; // future deadline
      await bridgeInTokens(fixture, { account: user1, amount: feeAmount });
      await expect(sendClaimCollateral(createClaimParams)).to.not.be.reverted;
    });

    it("should revert if any data in params is tampered", async () => {
      createClaimParams.userNonce = 1; // set value upfront to have the same user nonce for relayParams here and when recalculated in sendClaimCollateral
      const relayParams = await getRelayParams(createClaimParams);
      const signature = await getClaimCollateralSignature({
        ...createClaimParams,
        relayParams,
        verifyingContract: createClaimParams.relayRouter.address,
      });
      createClaimParams.signature = signature;

      createClaimParams.deadline = 9999999998; // tamper a param field
      await bridgeInTokens(fixture, { account: user1, amount: feeAmount });
      await expect(sendClaimCollateral(createClaimParams)).to.be.revertedWithCustomError(
        errorsContract,
        "InvalidRecoveredSigner"
      );

      createClaimParams.deadline = 9999999999; // use the original value again
      await expect(sendClaimCollateral(createClaimParams)).to.not.be.reverted;
    });

    it("should revert if fee cannot be covered", async () => {
      await expect(sendClaimCollateral(createClaimParams)).to.be.revertedWithCustomError(
        errorsContract,
        "InsufficientMultichainBalance"
      );

      await bridgeInTokens(fixture, { account: user1, amount: feeAmount });
      await sendClaimCollateral(createClaimParams); //).to.not.be.reverted;
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

    let createClaimParams: Parameters<typeof sendClaimAffiliateRewards>[0];
    beforeEach(async () => {
      // affiliate will pay the relay fee from his existing wnt multichain balance
      createClaimParams = {
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
    });

    it("Affiliate receives rewards in his multichain balance, pays relay fee from existing multichain balance", async () => {
      expect(
        await dataStore.getUint(keys.affiliateRewardKey(ethUsdMarket.marketToken, usdc.address, user1.address))
      ).to.eq(expandDecimals(25, 6)); // $25
      // increase affiliate's wnt multichain balance to pay for fees
      await bridgeInTokens(fixture, { account: user1, amount: feeAmount });

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
      createClaimParams.feeParams = {
        feeToken: usdc.address, // user will use his newly claimed usdc to pay for fees
        feeAmount: expandDecimals(15, 6), // 15 USD = 0.003 ETH (feeAmount must be gt relayFeeAmount)
        feeSwapPath: [ethUsdMarket.marketToken],
      };
      createClaimParams.oracleParams = {
        tokens: [wnt.address, usdc.address],
        providers: [chainlinkPriceFeedProvider.address, chainlinkPriceFeedProvider.address],
        data: ["0x", "0x"],
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
