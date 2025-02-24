import { expect } from "chai";
import { impersonateAccount, setBalance } from "@nomicfoundation/hardhat-network-helpers";

import { expandDecimals } from "../../utils/math";
import { deployFixture } from "../../utils/fixture";
import { GELATO_RELAY_ADDRESS } from "../../utils/relay/addresses";
import { sendCreateDeposit, sendCreateWithdrawal } from "../../utils/relay/multichain";
import * as keys from "../../utils/keys";
import { executeDeposit, getDepositCount, getDepositKeys } from "../../utils/deposit";
import { getWithdrawalCount, getWithdrawalKeys } from "../../utils/withdrawal";
import { getBalanceOf } from "../../utils/token";

describe("MultichainGmRouter", () => {
  let fixture;
  let user0, user1, user2, user3;
  let reader,
    dataStore,
    multichainGmRouter,
    depositVault,
    withdrawalVault,
    ethUsdMarket,
    wnt,
    usdc,
    layerZeroProvider,
    mockStargatePool;
  let relaySigner;
  let chainId;

  let defaultParams;
  let createDepositParams: Parameters<typeof sendCreateDeposit>[0];

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1, user2, user3 } = fixture.accounts);
    ({
      reader,
      dataStore,
      multichainGmRouter,
      depositVault,
      withdrawalVault,
      ethUsdMarket,
      wnt,
      usdc,
      layerZeroProvider,
      mockStargatePool,
    } = fixture.contracts);

    defaultParams = {
      addresses: {
        receiver: user1.address,
        callbackContract: user1.address,
        uiFeeReceiver: user2.address,
        market: ethUsdMarket.marketToken,
        initialLongToken: ethUsdMarket.longToken,
        initialShortToken: ethUsdMarket.shortToken,
        longTokenSwapPath: [ethUsdMarket.marketToken],
        shortTokenSwapPath: [ethUsdMarket.marketToken],
      },
      minMarketTokens: 100,
      shouldUnwrapNativeToken: false,
      executionFee: 0,
      callbackGasLimit: "200000",
      dataList: [],
    };

    await impersonateAccount(GELATO_RELAY_ADDRESS);
    await setBalance(GELATO_RELAY_ADDRESS, expandDecimals(1, 16)); // 0.01 ETH to pay tx fees

    relaySigner = await hre.ethers.getSigner(GELATO_RELAY_ADDRESS);
    chainId = await hre.ethers.provider.getNetwork().then((network) => network.chainId);

    createDepositParams = {
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: wnt.address,
        feeAmount: expandDecimals(5, 15), // 0.005 ETH
        feeSwapPath: [],
      },
      transferRequests: {
        tokens: [wnt.address, usdc.address],
        receivers: [depositVault.address, depositVault.address],
        amounts: [expandDecimals(10, 18), expandDecimals(50_000, 6)],
      },
      account: user0.address,
      params: defaultParams,
      deadline: 9999999999,
      chainId,
      srcChainId: chainId, // 0 would mean same chain action
      desChainId: chainId, // for non-multichain actions, desChainId and srcChainId are the same
      relayRouter: multichainGmRouter,
      relayFeeToken: wnt.address,
      relayFeeAmount: expandDecimals(2, 15), // 0.002 ETH
    };

    await dataStore.setAddress(keys.FEE_RECEIVER, user3.address);

    const wntAmount = expandDecimals(15, 18); // 15 ETH
    const usdcAmount = expandDecimals(75_000, 6); // 75,000 USDC
    await wnt.mint(user0.address, wntAmount);
    await usdc.mint(user0.address, usdcAmount);

    // mock wnt bridging (increase user's wnt multichain balance)
    const encodedMessageEth = ethers.utils.defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [user0.address, wnt.address, createDepositParams.srcChainId]
    );
    await wnt.connect(user0).approve(mockStargatePool.address, wntAmount);
    await mockStargatePool
      .connect(user0)
      .sendToken(wnt.address, layerZeroProvider.address, wntAmount, encodedMessageEth);
    // mock usdc bridging (increase user's usdc multichain balance)
    const encodedMessageUsdc = ethers.utils.defaultAbiCoder.encode(
      ["address", "address", "uint256"],
      [user0.address, usdc.address, createDepositParams.srcChainId]
    );
    await usdc.connect(user0).approve(mockStargatePool.address, usdcAmount);
    await mockStargatePool
      .connect(user0)
      .sendToken(usdc.address, layerZeroProvider.address, usdcAmount, encodedMessageUsdc);
  });

  describe("createDeposit", () => {
    it("creates deposit and sends relayer fee", async () => {
      expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, wnt.address))).to.eq(
        expandDecimals(15, 18)
      ); // 15 ETH
      expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, usdc.address))).to.eq(
        expandDecimals(75_000, 6)
      ); // 75,000 USDC
      expect(await wnt.balanceOf(GELATO_RELAY_ADDRESS)).to.eq(0);
      expect(await wnt.balanceOf(user3.address)).eq(0); // FEE_RECEIVER

      await sendCreateDeposit(createDepositParams);

      // user's multichain balance was decreased by the deposit amounts + 0.005 ETH fee
      expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, wnt.address))).to.eq(
        // fee is paid first, transfers are proccessed afterwards => user must bridge deposit + fee
        // TODO: should the 0.005 fee be taken from deposit instead of user's multichain balance
        // e.g. if there are exactly 10 WNT in user's multichain balance and does a 10 WNT deposit, tx fails because there are no additional funds to pay the fee
        expandDecimals(4_995, 15)
      ); // 15 - 10 - 0.005 = 4.995 ETH
      expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, usdc.address))).to.eq(
        expandDecimals(25_000, 6)
      ); // 75,000 - 50,000 = 25,000 USDC
      expect(await wnt.balanceOf(GELATO_RELAY_ADDRESS)).to.eq(createDepositParams.relayFeeAmount); // 0.002 ETH
      expect(await wnt.balanceOf(user3.address)).eq(0); // FEE_RECEIVER

      const depositKeys = await getDepositKeys(dataStore, 0, 1);
      const deposit = await reader.getDeposit(dataStore.address, depositKeys[0]);
      expect(deposit.addresses.account).eq(user0.address);
      expect(deposit.addresses.receiver).eq(defaultParams.addresses.receiver);
      expect(deposit.addresses.callbackContract).eq(defaultParams.addresses.callbackContract);
      expect(deposit.addresses.market).eq(defaultParams.addresses.market);
      expect(deposit.addresses.initialLongToken).eq(createDepositParams.transferRequests.tokens[0]);
      expect(deposit.addresses.initialShortToken).eq(createDepositParams.transferRequests.tokens[1]);
      expect(deposit.addresses.longTokenSwapPath).deep.eq(defaultParams.addresses.longTokenSwapPath);
      expect(deposit.addresses.shortTokenSwapPath).deep.eq(defaultParams.addresses.shortTokenSwapPath);
      expect(deposit.numbers.initialLongTokenAmount).eq(createDepositParams.transferRequests.amounts[0]); // 10 ETH
      expect(deposit.numbers.initialShortTokenAmount).eq(createDepositParams.transferRequests.amounts[1]); // 50,000 USDC
      expect(deposit.numbers.minMarketTokens).eq(defaultParams.minMarketTokens);
      expect(deposit.numbers.executionFee).eq(
        ethers.BigNumber.from(createDepositParams.feeParams.feeAmount).sub(createDepositParams.relayFeeAmount)
      ); // 0.005 - 0.002 = 0.003 ETH
      expect(deposit.numbers.callbackGasLimit).eq(defaultParams.callbackGasLimit);
      expect(deposit.flags.shouldUnwrapNativeToken).eq(defaultParams.shouldUnwrapNativeToken);
      expect(deposit._dataList).deep.eq(defaultParams.dataList);
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
          longTokenSwapPath: [ethUsdMarket.marketToken],
          shortTokenSwapPath: [ethUsdMarket.marketToken],
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
          feeAmount: expandDecimals(5, 15), // 0.005 ETH
          feeSwapPath: [],
        },
        transferRequests: {
          tokens: [ethUsdMarket.marketToken],
          receivers: [withdrawalVault.address],
          amounts: [expandDecimals(100_000, 18)],
        },
        account: user1.address, // user1 was the receiver of the deposit
        params: defaultWithdrawalParams,
        deadline: 9999999999,
        chainId,
        srcChainId: chainId,
        desChainId: chainId,
        relayRouter: multichainGmRouter,
        relayFeeToken: wnt.address,
        relayFeeAmount: expandDecimals(2, 15), // 0.002 ETH
      };
    });

    it.skip("creates withdrawal and sends relayer fee", async () => {
      await sendCreateDeposit(createDepositParams);

      // const _initialLongToken = await contractAt("MintableToken", defaultParams.addresses.initialLongToken);
      // await _initialLongToken.mint(depositVault.address, createDepositParams.transferRequests.amounts[0]);
      // const _initialShortToken = await contractAt("MintableToken", defaultParams.addresses.initialShortToken);
      // await _initialShortToken.mint(depositVault.address, createDepositParams.transferRequests.amounts[1]);

      expect(await wnt.balanceOf(user0.address)).eq(0);
      expect(await usdc.balanceOf(user0.address)).eq(0);
      expect(await getBalanceOf(ethUsdMarket.marketToken, user1.address)).eq(0); // GM
      expect(await wnt.balanceOf(depositVault.address)).eq(expandDecimals(10, 18).add(expandDecimals(3, 15))); // 10.003 ETH
      expect(await usdc.balanceOf(depositVault.address)).eq(expandDecimals(50_000, 6)); // 50,000 USDC

      // TODO: Deposit was cancelled: {"name":"UsdDeltaExceedsPoolValue","args":["-50000000000000000000000000000000000","0"]}
      // if commenting out utils/deposit.ts/L140   =>   throw new Error(`Deposit was cancelled: ${getErrorString(cancellationReason)}`);
      // then contracts execute the deposit, but funds are returned to user0 and no GM tokens are minted to user1
      expect(await getDepositCount(dataStore)).eq(1);
      await executeDeposit(fixture, { gasUsageLabel: "executeDeposit" });
      expect(await getDepositCount(dataStore)).eq(0);

      // expect(await wnt.balanceOf(user0.address)).eq(0); // TODO: executeDeposit failed and 10 ETH was returned to user0
      // expect(await usdc.balanceOf(user0.address)).eq(0); // TODO: executeDeposit failed and 50,000 USDC was returned to user0
      // expect(await getBalanceOf(ethUsdMarket.marketToken, user1.address)).eq(expandDecimals(100_000, 18)); // TODO: executeDeposit failed and no GM tokens were minted to user1
      expect(await wnt.balanceOf(depositVault.address)).eq(0);
      expect(await usdc.balanceOf(depositVault.address)).eq(0);

      // TODO: fix executeDeposit to mint GM tokens

      expect(await getWithdrawalCount(dataStore)).eq(0);
      // await sendCreateWithdrawal(createWithdrawalParams);
      // expect(await getWithdrawalCount(dataStore)).eq(1);

      // const withdrawalKeys = await getWithdrawalKeys(dataStore, 0, 1);
      // const withdrawal = await reader.getWithdrawal(dataStore.address, withdrawalKeys[0]);
      // expect(withdrawal.addresses.account).eq(user1.address);
      // expect(withdrawal.addresses.receiver).eq(defaultWithdrawalParams.addresses.receiver);
      // expect(withdrawal.addresses.callbackContract).eq(defaultWithdrawalParams.addresses.callbackContract);
      // expect(withdrawal.addresses.market).eq(defaultWithdrawalParams.addresses.market);
      // expect(withdrawal.numbers.marketTokenAmount).eq(createWithdrawalParams.transferRequests.amounts[0]); // 100,000 GM
      // expect(withdrawal.numbers.minLongTokenAmount).eq(createWithdrawalParams.params.minLongTokenAmount);
      // expect(withdrawal.numbers.minShortTokenAmount).eq(createWithdrawalParams.params.minShortTokenAmount);
      // expect(withdrawal.numbers.executionFee).eq(createWithdrawalParams.params.executionFee);
      // expect(withdrawal.numbers.callbackGasLimit).eq(createWithdrawalParams.params.callbackGasLimit);
      // expect(withdrawal.flags.shouldUnwrapNativeToken).eq(createWithdrawalParams.params.shouldUnwrapNativeToken);
      // expect(withdrawal._dataList).deep.eq(createWithdrawalParams.params.dataList);
    });
  });
});
