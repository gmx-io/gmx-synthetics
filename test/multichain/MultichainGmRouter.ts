import { expect } from "chai";
import { impersonateAccount, setBalance } from "@nomicfoundation/hardhat-network-helpers";

import { decimalToFloat, expandDecimals } from "../../utils/math";
import { deployFixture } from "../../utils/fixture";
import { GELATO_RELAY_ADDRESS } from "../../utils/relay/addresses";
import {
  sendCreateDeposit,
  sendCreateWithdrawal,
  sendCreateShift,
  sendCreateGlvDeposit,
  sendCreateGlvWithdrawal,
  sendCreateOrder,
  sendUpdateOrder,
} from "../../utils/relay/multichain";
import * as keys from "../../utils/keys";
import { executeDeposit, getDepositCount, getDepositKeys } from "../../utils/deposit";
import { executeWithdrawal, getWithdrawalCount, getWithdrawalKeys } from "../../utils/withdrawal";
import { getBalanceOf } from "../../utils/token";
import { BigNumberish, Contract } from "ethers";
import { executeShift, getShiftCount, getShiftKeys } from "../../utils/shift";
import { executeGlvDeposit, executeGlvWithdrawal, getGlvDepositCount, getGlvWithdrawalCount } from "../../utils/glv";
import { DecreasePositionSwapType, executeOrder, getOrderCount, getOrderKeys, OrderType } from "../../utils/order";
import { hashString } from "../../utils/hash";
import { getPositionCount } from "../../utils/position";
import { expectBalance } from "../../utils/validation";

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
    withdrawalVault,
    shiftVault,
    glvVault,
    ethUsdMarket,
    solUsdMarket,
    ethUsdGlvAddress,
    wnt,
    usdc;
  let relaySigner;
  let chainId;

  let defaultDepositParams;
  let createDepositParams: Parameters<typeof sendCreateDeposit>[0];

  async function mintAndBridge(
    fixture,
    overrides: {
      account?: string;
      token: Contract;
      tokenAmount: BigNumberish;
      srcChainId?: BigNumberish;
    }
  ) {
    const { mockStargatePool, layerZeroProvider } = fixture.contracts;
    const { user0 } = fixture.accounts;

    const account = overrides.account || user0;
    const token = overrides.token;
    const tokenAmount = overrides.tokenAmount;
    const srcChainId =
      overrides.srcChainId || (await hre.ethers.provider.getNetwork().then((network) => network.chainId));

    await token.mint(account.address, tokenAmount);

    // mock token bridging (increase user's multichain balance)
    const encodedMessageEth = ethers.utils.defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [account.address, token.address, srcChainId]
    );
    await token.connect(account).approve(mockStargatePool.address, tokenAmount);
    await mockStargatePool
      .connect(account)
      .sendToken(token.address, layerZeroProvider.address, tokenAmount, encodedMessageEth);
  }

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
      withdrawalVault,
      shiftVault,
      glvVault,
      ethUsdMarket,
      solUsdMarket,
      ethUsdGlvAddress,
      wnt,
      usdc,
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
      executionFee: expandDecimals(123, 15), // TODO: Why executionFee is not deducted and sent to FEE_RECEIVER when depsoit is executed?
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
    await mintAndBridge(fixture, { token: wnt, tokenAmount: wntAmount.add(feeAmount) });
    await mintAndBridge(fixture, { token: usdc, tokenAmount: usdcAmount });
  });

  describe("createDeposit", () => {
    it("creates deposit and sends relayer fee", async () => {
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
      expect(deposit.addresses.market).eq(defaultDepositParams.addresses.market);
      expect(deposit.addresses.initialLongToken).eq(createDepositParams.transferRequests.tokens[0]);
      expect(deposit.addresses.initialShortToken).eq(createDepositParams.transferRequests.tokens[1]);
      expect(deposit.addresses.longTokenSwapPath).deep.eq(defaultDepositParams.addresses.longTokenSwapPath);
      expect(deposit.addresses.shortTokenSwapPath).deep.eq(defaultDepositParams.addresses.shortTokenSwapPath);
      expect(deposit.numbers.initialLongTokenAmount).eq(createDepositParams.transferRequests.amounts[0]); // 10.006 ETH
      expect(deposit.numbers.initialShortTokenAmount).eq(createDepositParams.transferRequests.amounts[1]); // 45,000.00 USDC
      expect(deposit.numbers.minMarketTokens).eq(defaultDepositParams.minMarketTokens);
      expect(deposit.numbers.executionFee).eq(expandDecimals(4, 15)); // 0.006 - 0.002 = 0.004 ETH
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
      expect(await wnt.balanceOf(multichainVault.address)).eq(expandDecimals(4, 15));
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(
        expandDecimals(4, 15)
      ); // TODO: Why was executionFee returned to multichainVault/user1's multichain balance?
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
        executionFee: 0,
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
      await mintAndBridge(fixture, { account: user1, token: wnt, tokenAmount: expandDecimals(3, 15) }); // add additional fee to user1's multichain balance
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
        executionFee: expandDecimals(1, 15),
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
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdMarket.marketToken))).to.eq(
        expandDecimals(95_000, 18)
      );
      await sendCreateShift(createShiftParams);

      const shiftKeys = await getShiftKeys(dataStore, 0, 1);
      const shift = await reader.getShift(dataStore.address, shiftKeys[0]);
      expect(shift.addresses.account).eq(user1.address);
      expect(await getShiftCount(dataStore)).eq(1);

      // await executeShift(fixture, { gasUsageLabel: "executeShift" });
      // shift = await reader.getShift(dataStore.address, shiftKeys[0]);
      // expect(shift.addresses.account).eq(ethers.constants.AddressZero);
    });
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
      it("creates glvDeposit and sends relayer fee", async () => {
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
          initialCollateralDeltaAmount: 0,
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
    });
    const feeAmount = expandDecimals(6, 15);

    let createOrderParams: Parameters<typeof sendCreateOrder>[0];
    beforeEach(async () => {
      createOrderParams = {
        sender: relaySigner,
        signer: user1,
        feeParams: {
          feeToken: wnt.address,
          feeAmount: feeAmount,
          feeSwapPath: [],
        },
        collateralDeltaAmount: collateralDeltaAmount,
        account: user1.address,
        params: defaultOrderParams,
        deadline: 9999999999,
        srcChainId: chainId, // 0 means non-multichain action
        desChainId: chainId, // for non-multichain actions, desChainId is the same as chainId
        relayRouter: multichainOrderRouter,
        chainId,
        relayFeeToken: wnt.address,
        relayFeeAmount: feeAmount,
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
        expect(await wnt.balanceOf(GELATO_RELAY_ADDRESS)).to.eq(initialFeeReceiverBalance.add(feeAmount));
        expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(
          initialUser1Balance
        );

        await executeOrder(fixture, { gasUsageLabel: "executeOrder" });

        expect(await getOrderCount(dataStore)).to.eq(0);
        expect(await getPositionCount(dataStore)).to.eq(1);
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
            feeAmount: expandDecimals(2, 15), // 0.002 ETH
            feeSwapPath: [],
          },
          tokenPermits: [],
          account: user1.address,
          params: {
            sizeDeltaUsd: decimalToFloat(1),
            acceptablePrice: decimalToFloat(2),
            triggerPrice: decimalToFloat(3),
            minOutputAmount: 4,
            validFromTime: 5,
            autoCancel: true,
          },
          key: ethers.constants.HashZero,
          deadline: 9999999999,
          srcChainId: chainId, // 0 means non-multichain action
          desChainId: chainId, // for non-multichain actions, desChainId is the same as chainId
          relayRouter: multichainOrderRouter,
          chainId,
          relayFeeToken: wnt.address,
          relayFeeAmount: expandDecimals(1, 15),
          increaseExecutionFee: false,
        };
      });

      it("updates multichain order and sends relayer fee", async () => {
        await sendCreateDeposit(createDepositParams);
        await executeDeposit(fixture, { gasUsageLabel: "executeMultichainDeposit" });
        await mintAndBridge(fixture, { account: user1, token: wnt, tokenAmount: collateralDeltaAmount.add(feeAmount) });
        await sendCreateOrder(createOrderParams);
        const initialFeeReceiverBalance = await wnt.balanceOf(GELATO_RELAY_ADDRESS);

        const orderKeys = await getOrderKeys(dataStore, 0, 1);
        let order = await reader.getOrder(dataStore.address, orderKeys[0]);
        expect(order.numbers.sizeDeltaUsd).eq(decimalToFloat(25000));
        expect(order.numbers.acceptablePrice).eq(decimalToFloat(4900));
        expect(order.numbers.triggerPrice).eq(decimalToFloat(4800));
        expect(order.numbers.minOutputAmount).eq(700);
        expect(order.numbers.validFromTime).eq(0);
        expect(order.flags.autoCancel).eq(false);

        await sendUpdateOrder({ ...updateOrderParams, key: orderKeys[0] });

        order = await reader.getOrder(dataStore.address, orderKeys[0]);
        expect(order.numbers.sizeDeltaUsd).eq(decimalToFloat(1));
        expect(order.numbers.acceptablePrice).eq(decimalToFloat(2));
        expect(order.numbers.triggerPrice).eq(decimalToFloat(3));
        expect(order.numbers.minOutputAmount).eq(4);
        expect(order.numbers.validFromTime).eq(5);
        expect(order.flags.autoCancel).eq(true);
        await expectBalance(
          wnt.address,
          GELATO_RELAY_ADDRESS,
          initialFeeReceiverBalance.add(updateOrderParams.relayFeeAmount)
        );
      });
    });
  });
});
