import { expect } from "chai";
import { impersonateAccount, setBalance } from "@nomicfoundation/hardhat-network-helpers";

import { expandDecimals } from "../../utils/math";
import { deployFixture } from "../../utils/fixture";
import { GELATO_RELAY_ADDRESS } from "../../utils/relay/addresses";
import { sendCreateDeposit } from "../../utils/relay/multichain";
import * as keys from "../../utils/keys";
import { getDepositKeys } from "../../utils/deposit";

describe("MultichainGmRouter", () => {
  let fixture;
  let user0, user1, user2, user3;
  let reader, dataStore, multichainGmRouter, depositVault, ethUsdMarket, wnt, usdc, layerZeroProvider, mockStargatePool;
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
      ethUsdMarket,
      wnt,
      usdc,
      layerZeroProvider,
      mockStargatePool,
    } = fixture.contracts);

    defaultParams = {
      addresses: {
        receiver: user0.address,
        callbackContract: user1.address,
        uiFeeReceiver: user2.address,
        market: ethUsdMarket.marketToken,
        initialLongToken: ethUsdMarket.longToken,
        initialShortToken: ethUsdMarket.shortToken,
        longTokenSwapPath: [ethUsdMarket.marketToken],
        shortTokenSwapPath: [ethUsdMarket.marketToken],
      },
      minMarketTokens: 0,
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
      tokenPermits: [],
      transferRequests: {
        tokens: [wnt.address, usdc.address],
        receivers: [depositVault.address, depositVault.address],
        amounts: [expandDecimals(1, 18), expandDecimals(5000, 6)],
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

    const wntAmount = expandDecimals(10, 18);
    const usdcAmount = expandDecimals(50000, 6);
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
        expandDecimals(10, 18)
      ); // 10 ETH
      expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, usdc.address))).to.eq(
        expandDecimals(50_000, 6)
      ); // 50.000 USDC
      expect(await wnt.balanceOf(GELATO_RELAY_ADDRESS)).to.eq(0);
      expect(await wnt.balanceOf(user3.address)).eq(0); // FEE_RECEIVER

      await sendCreateDeposit(createDepositParams);

      // user's multichain balance was decreased by the deposit amounts + 0.005 ETH fee
      expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, wnt.address))).to.eq(
        expandDecimals(8_995, 15)
      ); // 10 - 1 - 0.005 = 8.995 ETH
      expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, usdc.address))).to.eq(
        expandDecimals(45_000, 6)
      ); // 50.000 - 5.000 = 45.000 USDC
      expect(await wnt.balanceOf(GELATO_RELAY_ADDRESS)).to.eq(expandDecimals(2, 15)); // 0.002 ETH (createDepositParams.relayFeeAmount)
      // TODO: why is FEE_RECEIVER getting 1 WNT?
      expect(await wnt.balanceOf(user3.address)).eq(expandDecimals(1, 18)); // FEE_RECEIVER

      const depositKeys = await getDepositKeys(dataStore, 0, 1);
      const deposit = await reader.getDeposit(dataStore.address, depositKeys[0]);
      expect(deposit.addresses.account).eq(user0.address);
      expect(deposit.addresses.receiver).eq(defaultParams.addresses.receiver);
      expect(deposit.addresses.callbackContract).eq(defaultParams.addresses.callbackContract);
      expect(deposit.addresses.market).eq(defaultParams.addresses.market);
      expect(deposit.addresses.initialLongToken).eq(defaultParams.addresses.initialLongToken);
      expect(deposit.addresses.initialShortToken).eq(defaultParams.addresses.initialShortToken);
      expect(deposit.addresses.longTokenSwapPath).deep.eq(defaultParams.addresses.longTokenSwapPath);
      expect(deposit.addresses.shortTokenSwapPath).deep.eq(defaultParams.addresses.shortTokenSwapPath);
      // TODO: why initialLongTokenAmount is not 1 ETH?
      expect(deposit.numbers.initialLongTokenAmount).eq(0);
      expect(deposit.numbers.initialShortTokenAmount).eq(expandDecimals(5000, 6));
      expect(deposit.numbers.minMarketTokens).eq(defaultParams.minMarketTokens);
      expect(deposit.numbers.executionFee).eq(expandDecimals(3, 15)); // 0.005 - 0.002 = 0.003 ETH (createDepositParams.feeParams.feeAmount - createDepositParams.relayFeeAmount)
      expect(deposit.numbers.callbackGasLimit).eq(defaultParams.callbackGasLimit);
      expect(deposit.flags.shouldUnwrapNativeToken).eq(defaultParams.shouldUnwrapNativeToken);
      expect(deposit._dataList).deep.eq(defaultParams.dataList);
    });
  });
});
