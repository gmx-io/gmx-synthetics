import { expect } from "chai";
import { impersonateAccount, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { expandDecimals } from "../../utils/math";
import { deployFixture } from "../../utils/fixture";
import { GELATO_RELAY_ADDRESS } from "../../utils/relay/addresses";
import { sendCreateDeposit, sendCreateGlvDeposit, sendCreateGlvWithdrawal } from "../../utils/relay/multichain";
import * as keys from "../../utils/keys";
import { executeDeposit } from "../../utils/deposit";
import { getBalanceOf } from "../../utils/token";
import { executeGlvDeposit, executeGlvWithdrawal, getGlvDepositCount, getGlvWithdrawalCount } from "../../utils/glv";
import { mintAndBridge } from "./utils";

describe("MultichainGlvRouter", () => {
  let fixture;
  let user0, user1, user2, user3;
  let dataStore,
    multichainGmRouter,
    multichainGlvRouter,
    multichainVault,
    depositVault,
    glvVault,
    ethUsdMarket,
    ethUsdGlvAddress,
    wnt,
    usdc,
    mockStargatePoolUsdc,
    mockStargatePoolWnt;
  let relaySigner;
  let chainId;

  let defaultDepositParams;
  let createDepositParams: Parameters<typeof sendCreateDeposit>[0];

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1, user2, user3 } = fixture.accounts);
    ({
      dataStore,
      multichainGmRouter,
      multichainGlvRouter,
      multichainVault,
      depositVault,
      glvVault,
      ethUsdMarket,
      ethUsdGlvAddress,
      wnt,
      usdc,
      mockStargatePoolUsdc,
      mockStargatePoolWnt,
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
    const feeAmountDeposit = expandDecimals(6, 15);

    createDepositParams = {
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: wnt.address,
        feeAmount: feeAmountDeposit, // 0.006 ETH
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
    await mintAndBridge(fixture, { token: wnt, tokenAmount: wntAmount.add(feeAmountDeposit) });

    await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolUsdc.address), true);
    await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolUsdc.address), true);
    await mintAndBridge(fixture, { token: usdc, tokenAmount: usdcAmount });
  });

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
