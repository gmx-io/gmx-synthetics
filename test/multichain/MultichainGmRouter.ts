import { expect } from "chai";
import { impersonateAccount, setBalance } from "@nomicfoundation/hardhat-network-helpers";

import { decimalToFloat, expandDecimals } from "../../utils/math";
import { deployFixture } from "../../utils/fixture";
import { GELATO_RELAY_ADDRESS } from "../../utils/relay/addresses";
import { sendCreateDeposit, sendCreateWithdrawal, sendCreateShift } from "../../utils/relay/multichain";
import * as keys from "../../utils/keys";
import { executeDeposit, getDepositCount, getDepositKeys } from "../../utils/deposit";
import { executeWithdrawal, getWithdrawalCount, getWithdrawalKeys } from "../../utils/withdrawal";
import { getBalanceOf } from "../../utils/token";
import { executeShift, getShiftCount, getShiftKeys } from "../../utils/shift";
import { encodeBridgeOutDataList, mintAndBridge } from "../../utils/multichain";

describe("MultichainGmRouter", () => {
  let fixture;
  let user0, user1, user2, user3;
  let reader,
    dataStore,
    multichainGmRouter,
    multichainVault,
    depositVault,
    withdrawalVault,
    shiftVault,
    ethUsdMarket,
    solUsdMarket,
    wnt,
    usdc,
    mockStargatePoolUsdc,
    mockStargatePoolNative;
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
      multichainVault,
      depositVault,
      withdrawalVault,
      shiftVault,
      ethUsdMarket,
      solUsdMarket,
      wnt,
      usdc,
      mockStargatePoolUsdc,
      mockStargatePoolNative,
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

    await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolNative.address), true);
    await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolNative.address), true);
    await mintAndBridge(fixture, { tokenAmount: wntAmount.add(feeAmount) });

    await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolUsdc.address), true);
    await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolUsdc.address), true);
    await mintAndBridge(fixture, { token: usdc, tokenAmount: usdcAmount });
  });

  describe("createDeposit", () => {
    it("creates deposit and sends relayer fee", async () => {
      // enable keeper fee payment
      await dataStore.setUint(keys.EXECUTION_GAS_FEE_MULTIPLIER_FACTOR, decimalToFloat(1));

      // funds have already been bridged to multichainVault and recorded under user's multichain balance
      expect(await wnt.balanceOf(multichainVault.address)).eq(expandDecimals(10_006, 15)); // 10 + 0.006 = 10.006 ETH
      expect(await usdc.balanceOf(multichainVault.address)).eq(expandDecimals(45_000, 6));
      expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, wnt.address))).to.eq(
        expandDecimals(10_006, 15)
      );
      expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, usdc.address))).to.eq(
        expandDecimals(45_000, 6)
      );
      expect(await wnt.balanceOf(depositVault.address)).eq(0);
      expect(await usdc.balanceOf(depositVault.address)).eq(0);
      expect(await wnt.balanceOf(GELATO_RELAY_ADDRESS)).to.eq(0);
      expect(await wnt.balanceOf(user3.address)).eq(0); // FEE_RECEIVER

      await sendCreateDeposit(createDepositParams);

      // createDeposit moves the funds from multichainVault to depositVault and decreases user's multichain balance
      // fee is paid first, transfers are proccessed afterwards => user must bridge deposit + fee
      // e.g. if there are exactly 10 WNT in user's multichain balance and does a 10 WNT deposit, tx fails because there are no additional funds to pay the fee
      expect(await wnt.balanceOf(multichainVault.address)).eq(0);
      expect(await usdc.balanceOf(multichainVault.address)).eq(0);
      expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, wnt.address))).to.eq(0);
      expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, usdc.address))).to.eq(0);
      expect(await wnt.balanceOf(depositVault.address)).eq(expandDecimals(10_004, 15)); // deposit + residualFee
      expect(await usdc.balanceOf(depositVault.address)).eq(expandDecimals(45_000, 6));
      expect(await wnt.balanceOf(GELATO_RELAY_ADDRESS)).to.eq(expandDecimals(2, 15)); // createDepositParams.relayFeeAmount
      expect(await wnt.balanceOf(user3.address)).eq(0); // FEE_RECEIVER

      // check deposit was created correctly
      const depositKeys = await getDepositKeys(dataStore, 0, 1);
      const deposit = await reader.getDeposit(dataStore.address, depositKeys[0]);
      expect(deposit.addresses.account).eq(user0.address);
      expect(deposit.addresses.receiver).eq(defaultDepositParams.addresses.receiver);
      expect(deposit.addresses.callbackContract).eq(defaultDepositParams.addresses.callbackContract);
      expect(deposit.addresses.uiFeeReceiver).eq(defaultDepositParams.addresses.uiFeeReceiver);
      expect(deposit.addresses.market).eq(defaultDepositParams.addresses.market);
      expect(deposit.addresses.initialLongToken).eq(createDepositParams.transferRequests.tokens[0]);
      expect(deposit.addresses.initialShortToken).eq(createDepositParams.transferRequests.tokens[1]);
      expect(deposit.addresses.longTokenSwapPath).deep.eq(defaultDepositParams.addresses.longTokenSwapPath);
      expect(deposit.addresses.shortTokenSwapPath).deep.eq(defaultDepositParams.addresses.shortTokenSwapPath);
      expect(deposit.numbers.initialLongTokenAmount).eq(createDepositParams.transferRequests.amounts[0]); // 10.006 ETH
      expect(deposit.numbers.initialShortTokenAmount).eq(createDepositParams.transferRequests.amounts[1]); // 45,000.00 USDC
      expect(deposit.numbers.minMarketTokens).eq(defaultDepositParams.minMarketTokens);
      expect(deposit.numbers.executionFee).eq(expandDecimals(4, 15)); // feeAmount - relayFeeAmount = 0.006 - 0.002 = 0.004 ETH
      expect(deposit.numbers.callbackGasLimit).eq(defaultDepositParams.callbackGasLimit);
      expect(deposit.flags.shouldUnwrapNativeToken).eq(defaultDepositParams.shouldUnwrapNativeToken);
      expect(deposit._dataList).deep.eq(defaultDepositParams.dataList);

      // state before executing deposit
      expect(await getDepositCount(dataStore)).eq(1);
      expect(await wnt.balanceOf(depositVault.address)).eq(expandDecimals(10_004, 15)); // 10 + 0.006 - 0.002 = 10.004 ETH
      expect(await usdc.balanceOf(depositVault.address)).eq(expandDecimals(45_000, 6)); // 45,000 USDC
      expect(await wnt.balanceOf(ethUsdMarket.marketToken)).eq(0);
      expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(0);
      expect(await getBalanceOf(ethUsdMarket.marketToken, multichainVault.address)).eq(0); // 0 GM
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdMarket.marketToken))).to.eq(0); // 0 GM

      // moves funds from depositVault to market and mints GM tokens
      // GM tkens are minted to multichainVault and user's multichain balance is increased
      await executeDeposit(fixture, { gasUsageLabel: "executeDeposit" });

      // state after executing deposit
      expect(await getDepositCount(dataStore)).eq(0);
      expect(await wnt.balanceOf(multichainVault.address)).to.approximately(
        expandDecimals(2095, 12), // feeAmount - keeperFee = 0.004 - ~0.0019 = ~0.0021 (e.g. 0.002095)
        expandDecimals(1, 12)
      );
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.approximately(
        expandDecimals(2095, 12), // feeAmount - keeperFee = 0.004 - ~0.0019 = ~0.0021 (e.g. 0.002095)
        expandDecimals(5, 12)
      );
      expect(await usdc.balanceOf(multichainVault.address)).eq(0);
      expect(await wnt.balanceOf(depositVault.address)).eq(0);
      expect(await usdc.balanceOf(depositVault.address)).eq(0);
      expect(await wnt.balanceOf(ethUsdMarket.marketToken)).eq(expandDecimals(10, 18));
      expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(expandDecimals(45_000, 6));
      expect(await getBalanceOf(ethUsdMarket.marketToken, multichainVault.address)).eq(expandDecimals(95_000, 18)); // 95,000 GM
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdMarket.marketToken))).to.eq(
        expandDecimals(95_000, 18)
      ); // 95,000 GM
    });

    describe("bridgeOutFromController", () => {
      const actionType = 3; // ActionType.BridgeOut
      const deadline = Math.floor(Date.now() / 1000) + 3600; // deadline (1 hour from now)
      const providerData = ethers.utils.defaultAbiCoder.encode(["uint32"], [1]); // providerData

      it("create deposit and bridge out from controller the GM tokens, on the same chain", async () => {
        createDepositParams.params.addresses.receiver = user0.address; // receiver must the be account to enable bridging out from controller
        createDepositParams.params.dataList = encodeBridgeOutDataList(
          actionType,
          chainId, // desChainId
          deadline,
          ethers.constants.AddressZero, // provider (can be the zero address since the tokens are transferred directly to the user's wallet on the same chain)
          providerData
        );

        expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq(0);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, ethUsdMarket.marketToken))).to.eq(0);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, wnt.address))).to.eq(
          expandDecimals(10, 18).add(expandDecimals(6, 15))
        ); // depositAmount + (relayFee + executionFee)

        await sendCreateDeposit(createDepositParams);
        await executeDeposit(fixture, { gasUsageLabel: "executeDeposit" });

        expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq(expandDecimals(95_000, 18)); // 95,000 GM
        expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, ethUsdMarket.marketToken))).to.eq(0);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, wnt.address))).to.eq(
          expandDecimals(4, 15)
        ); // executionFee
      });

      // TODO: Enable test once hardhat supports changing the chain id during the test
      // without changing the chainId, tx reverts with InvalidRecoveredSigner (signature fails)
      // to test the bridgeOut flow, could temporarily disable the signature verification (e.g. comment out the RelayUtils.validateSignature call)
      it.skip("create deposit and bridge out from controller the GM tokens, on the source chain", async () => {
        // use the StargatePoolUSDC as the StargatePoolGM --> StargatePoolGM.token() will be the GM token
        const mockStargatePoolGM = mockStargatePoolUsdc;
        await mockStargatePoolGM.updateToken(ethUsdMarket.marketToken);

        createDepositParams.params.addresses.receiver = user0.address; // receiver must the be account to enable bridging out from controller
        createDepositParams.params.dataList = encodeBridgeOutDataList(
          actionType,
          chainId, // desChainId
          deadline,
          mockStargatePoolGM.address, // provider
          providerData
        );

        const srcChainId = 1;
        createDepositParams.srcChainId = srcChainId;
        await dataStore.setBool(keys.isSrcChainIdEnabledKey(srcChainId), true);
        await dataStore.setUint(keys.eidToSrcChainId(await mockStargatePoolGM.SRC_EID()), srcChainId);

        expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq(0);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, ethUsdMarket.marketToken))).to.eq(0);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, wnt.address))).to.eq(
          expandDecimals(10, 18).add(expandDecimals(6, 15))
        ); // depositAmount + (relayFee + executionFee)
        expect(await hre.ethers.provider.getBalance(mockStargatePoolGM.address)).eq(0);

        // TODO: impersonate srcChainId as the hardhat chainId
        await sendCreateDeposit(createDepositParams);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, wnt.address))).to.eq(0); // funds moved from user's multichain balance to the MultichainVault

        // top up user's multichain balance with the bridging fee, required to bridge out from controller
        const bridgingFee = await mockStargatePoolGM.BRIDGE_OUT_FEE();
        mintAndBridge(fixture, { account: user0, tokenAmount: bridgingFee });

        // TODO: impersonate chainId as the hardhat chainId
        await executeDeposit(fixture, { gasUsageLabel: "executeDeposit" });

        expect(await getBalanceOf(ethUsdMarket.marketToken, user0.address)).eq(expandDecimals(95_000, 18)); // 95,000 GM
        expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, ethUsdMarket.marketToken))).to.eq(0);
        expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, wnt.address))).to.eq(
          expandDecimals(4, 15)
        ); // executionFee
        expect(await hre.ethers.provider.getBalance(mockStargatePoolGM.address)).eq(bridgingFee); // mockStargatePoolGM received the bridging fee
      });
    });
  });

  describe("createWithdrawal", () => {
    let defaultWithdrawalParams;
    let createWithdrawalParams: Parameters<typeof sendCreateWithdrawal>[0];
    beforeEach(async () => {
      defaultWithdrawalParams = {
        addresses: {
          receiver: user1.address,
          callbackContract: user2.address,
          uiFeeReceiver: user2.address,
          market: ethUsdMarket.marketToken,
          longTokenSwapPath: [],
          shortTokenSwapPath: [],
        },
        minLongTokenAmount: 0,
        minShortTokenAmount: 0,
        shouldUnwrapNativeToken: false,
        executionFee: expandDecimals(4, 15), // feeAmount - relayFeeAmount = 0.007 - 0.003 = 0.004 ETH
        callbackGasLimit: "200000",
        dataList: [],
      };

      createWithdrawalParams = {
        sender: relaySigner,
        signer: user1, // user1 was the receiver of the deposit
        feeParams: {
          feeToken: wnt.address,
          feeAmount: expandDecimals(7, 15), // 0.007 ETH
          feeSwapPath: [],
        },
        transferRequests: {
          tokens: [ethUsdMarket.marketToken],
          receivers: [withdrawalVault.address],
          amounts: [expandDecimals(95_000, 18)],
        },
        account: user1.address, // user1 was the receiver of the deposit
        params: defaultWithdrawalParams,
        deadline: 9999999999,
        chainId,
        srcChainId: chainId,
        desChainId: chainId,
        relayRouter: multichainGmRouter,
        relayFeeToken: wnt.address,
        relayFeeAmount: expandDecimals(3, 15), // 0.003 ETH
      };
    });

    it("creates withdrawal and sends relayer fee", async () => {
      await sendCreateDeposit(createDepositParams); // leaves the residualFee (i.e. executionfee) of 0.004 ETH fee in multichainVault/user's multichain balance
      await mintAndBridge(fixture, { account: user1, tokenAmount: expandDecimals(3, 15) }); // add additional fee to user1's multichain balance
      await executeDeposit(fixture, { gasUsageLabel: "executeDeposit" });

      expect(await getWithdrawalCount(dataStore)).eq(0);
      expect(await wnt.balanceOf(multichainVault.address)).eq(expandDecimals(7, 15));
      expect(await usdc.balanceOf(multichainVault.address)).eq(0);
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(
        expandDecimals(7, 15)
      );
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(0);
      expect(await wnt.balanceOf(withdrawalVault.address)).eq(0);
      expect(await usdc.balanceOf(withdrawalVault.address)).eq(0);
      expect(await getBalanceOf(ethUsdMarket.marketToken, multichainVault.address)).eq(expandDecimals(95_000, 18)); // 95,000 GM
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdMarket.marketToken))).to.eq(
        expandDecimals(95_000, 18)
      ); // 95,000 GM

      // moves the GM from multichainVault to withdrawalVault and decreases user's GM multichain balance
      // GM tokens are burned
      // wnt/usdc are sent to multichainVault and user's multichain balance is increased
      await sendCreateWithdrawal(createWithdrawalParams);
      expect(await getWithdrawalCount(dataStore)).eq(1);

      const withdrawalKeys = await getWithdrawalKeys(dataStore, 0, 1);
      const withdrawal = await reader.getWithdrawal(dataStore.address, withdrawalKeys[0]);
      expect(withdrawal.addresses.account).eq(user1.address);
      expect(withdrawal.addresses.receiver).eq(defaultWithdrawalParams.addresses.receiver);
      expect(withdrawal.addresses.callbackContract).eq(defaultWithdrawalParams.addresses.callbackContract);
      expect(withdrawal.addresses.market).eq(defaultWithdrawalParams.addresses.market);
      expect(withdrawal.numbers.marketTokenAmount).eq(createWithdrawalParams.transferRequests.amounts[0]); // 95,000 GM
      expect(withdrawal.numbers.minLongTokenAmount).eq(createWithdrawalParams.params.minLongTokenAmount);
      expect(withdrawal.numbers.minShortTokenAmount).eq(createWithdrawalParams.params.minShortTokenAmount);
      expect(withdrawal.numbers.executionFee).eq(expandDecimals(4, 15)); // 0.007 - 0.003 = 0.004 ETH (feeAmount - relayFeeAmount)
      expect(withdrawal.numbers.callbackGasLimit).eq(createWithdrawalParams.params.callbackGasLimit);
      expect(withdrawal.flags.shouldUnwrapNativeToken).eq(createWithdrawalParams.params.shouldUnwrapNativeToken);
      expect(withdrawal._dataList).deep.eq(createWithdrawalParams.params.dataList);

      // check gm tokens have been burned and wnt/usdc have been sent to withdrawalVault and user's multichain balance has been increased
      expect(await getWithdrawalCount(dataStore)).eq(1);
      expect(await wnt.balanceOf(multichainVault.address)).eq(0); // fee was sent to withdrawalVault
      expect(await usdc.balanceOf(multichainVault.address)).eq(0);
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(0); // user's fee was sent to withdrawalVault
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(0);
      expect(await wnt.balanceOf(withdrawalVault.address)).eq(expandDecimals(4, 15)); // 0.004 ETH --> executionFee is sent to withdrawalVault
      expect(await usdc.balanceOf(withdrawalVault.address)).eq(0);
      expect(await getBalanceOf(ethUsdMarket.marketToken, multichainVault.address)).eq(0); // GM tokens were transferred out from multichainVault
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdMarket.marketToken))).to.eq(0); // user's multichain balance was decreased
      expect(await getBalanceOf(ethUsdMarket.marketToken, withdrawalVault.address)).eq(expandDecimals(95_000, 18)); // GM tokens were transferred into withdrawalVault

      // executeWithdrawal
      // moves funds from withdrawalVault to market and burns GM tokens
      // GM tokens are burned and wnt/usdc are sent to multichainVault and user's multichain balance is increased
      await executeWithdrawal(fixture, { gasUsageLabel: "executeWithdrawal" });

      // state after execute withdrawal
      expect(await getWithdrawalCount(dataStore)).eq(0);
      expect(await wnt.balanceOf(multichainVault.address)).eq(expandDecimals(10_004, 15));
      expect(await usdc.balanceOf(multichainVault.address)).eq(expandDecimals(45_000, 6));
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(
        expandDecimals(10_004, 15)
      );
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(
        expandDecimals(45_000, 6)
      );
      expect(await wnt.balanceOf(withdrawalVault.address)).eq(0); // all wnt was sent to multichainVault
      expect(await usdc.balanceOf(withdrawalVault.address)).eq(0); // all usdc was sent to multichainVault
      expect(await getBalanceOf(ethUsdMarket.marketToken, multichainVault.address)).eq(0); // all GM tokens were burned
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdMarket.marketToken))).to.eq(0); // all user's GM tokens were burned
    });
  });

  describe("createShift", () => {
    let defaultShiftParams;
    let createShiftParams: Parameters<typeof sendCreateShift>[0];
    const feeAmount = expandDecimals(4, 15);

    beforeEach(async () => {
      defaultShiftParams = {
        addresses: {
          receiver: user1.address,
          callbackContract: user2.address,
          uiFeeReceiver: user3.address,
          fromMarket: ethUsdMarket.marketToken,
          toMarket: solUsdMarket.marketToken,
        },
        minMarketTokens: 50,
        executionFee: expandDecimals(2, 15), // feeAmount - relayFeeAmount = 0.004 - 0.002 = 0.002 ETH
        callbackGasLimit: "200000",
        dataList: [],
      };

      createShiftParams = {
        sender: relaySigner,
        signer: user1,
        feeParams: {
          feeToken: wnt.address,
          feeAmount: feeAmount,
          feeSwapPath: [],
        },
        transferRequests: {
          tokens: [ethUsdMarket.marketToken],
          receivers: [shiftVault.address],
          amounts: [expandDecimals(50_000, 18)],
        },
        account: user1.address,
        params: defaultShiftParams,
        deadline: 9999999999,
        chainId,
        srcChainId: chainId,
        desChainId: chainId,
        relayRouter: multichainGmRouter,
        relayFeeToken: wnt.address,
        relayFeeAmount: expandDecimals(2, 15),
      };
    });

    it("creates shift and sends relayer fee", async () => {
      await sendCreateDeposit(createDepositParams);
      await executeDeposit(fixture, { gasUsageLabel: "executeDeposit" });

      expect(await getBalanceOf(ethUsdMarket.marketToken, multichainVault.address)).eq(expandDecimals(95_000, 18));
      expect(await getBalanceOf(solUsdMarket.marketToken, multichainVault.address)).eq(0);
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdMarket.marketToken))).to.eq(
        expandDecimals(95_000, 18)
      );

      await sendCreateShift(createShiftParams);

      const shiftKeys = await getShiftKeys(dataStore, 0, 1);
      let shift = await reader.getShift(dataStore.address, shiftKeys[0]);
      expect(shift.addresses.account).eq(user1.address);
      expect(await getShiftCount(dataStore)).eq(1);

      await executeShift(fixture, { gasUsageLabel: "executeShift" });

      expect(await getShiftCount(dataStore)).eq(0);
      shift = await reader.getShift(dataStore.address, shiftKeys[0]);
      expect(shift.addresses.account).eq(ethers.constants.AddressZero);

      expect(await getBalanceOf(ethUsdMarket.marketToken, multichainVault.address)).eq(expandDecimals(45_000, 18)); // 95k - 50k
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdMarket.marketToken))).to.eq(
        expandDecimals(45_000, 18)
      ); // 95k - 50k
      expect(await getBalanceOf(solUsdMarket.marketToken, multichainVault.address)).to.approximately(
        expandDecimals(50_000, 18),
        expandDecimals(1, 12)
      ); // ~50k
      expect(
        await dataStore.getUint(keys.multichainBalanceKey(user1.address, solUsdMarket.marketToken))
      ).to.approximately(expandDecimals(50_000, 18), expandDecimals(1, 12)); // ~50k
    });
  });
});
