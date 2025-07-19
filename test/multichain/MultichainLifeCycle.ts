import { expect } from "chai";
import { impersonateAccount, setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { decimalToFloat, expandDecimals } from "../../utils/math";
import { deployFixture } from "../../utils/fixture";
import { GELATO_RELAY_ADDRESS } from "../../utils/relay/addresses";
import {
  sendCreateDeposit,
  sendCreateWithdrawal,
  sendCreateGlvDeposit,
  sendCreateGlvWithdrawal,
  sendBridgeOut,
} from "../../utils/relay/multichain";
import * as keys from "../../utils/keys";
import { executeDeposit } from "../../utils/deposit";
import { executeWithdrawal } from "../../utils/withdrawal";
import { getBalanceOf } from "../../utils/token";
import { bridgeInTokens } from "../../utils/multichain";
import { executeGlvDeposit } from "../../utils/glv/glvDeposit";
import { executeGlvWithdrawal } from "../../utils/glv/glvWithdrawal";

describe("MultichainLifeCycle", () => {
  let fixture;
  let user1, user2;
  let dataStore,
    multichainGmRouter,
    multichainGlvRouter,
    multichainTransferRouter,
    multichainVault,
    depositVault,
    withdrawalVault,
    glvVault,
    ethUsdMarket,
    ethUsdGlvAddress,
    wnt,
    usdc,
    mockStargatePoolUsdc,
    mockStargatePoolNative;
  let relaySigner;
  let chainId;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user1, user2 } = fixture.accounts);
    ({
      dataStore,
      multichainGmRouter,
      multichainGlvRouter,
      multichainTransferRouter,
      multichainVault,
      depositVault,
      withdrawalVault,
      glvVault,
      ethUsdMarket,
      ethUsdGlvAddress,
      wnt,
      usdc,
      mockStargatePoolUsdc,
      mockStargatePoolNative,
    } = fixture.contracts);
  });

  beforeEach(async () => {
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

  const wntAmount = expandDecimals(10, 18);
  const usdcAmount = expandDecimals(45_000, 6);
  const feeAmount = expandDecimals(6, 15); // 0.006 ETH
  const executionFee = expandDecimals(4, 15); // 0.004 ETH
  const relayFeeAmount = expandDecimals(2, 15); // 0.002 ETH

  it("Life cycle test", async () => {
    // enable keeper fee payment
    await dataStore.setUint(keys.EXECUTION_GAS_FEE_MULTIPLIER_FACTOR, decimalToFloat(1));

    // 0. check initial balances

    // multichainVault balance
    expect(await wnt.balanceOf(multichainVault.address)).eq(0);
    expect(await usdc.balanceOf(multichainVault.address)).eq(0);
    // user's multichain balance
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(0);
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(0);

    // 1. mint and bridge WNT and USDC to multichainVault
    await bridgeInTokens(fixture, { account: user1, amount: wntAmount.add(feeAmount) });
    await bridgeInTokens(fixture, { account: user1, token: usdc, amount: usdcAmount });

    // multichainVault balance
    expect(await wnt.balanceOf(multichainVault.address)).eq(wntAmount.add(feeAmount)); // 10 + 0.006 = 10.006 ETH
    expect(await usdc.balanceOf(multichainVault.address)).eq(usdcAmount); // 45,000 USDC
    // user's multichain balance
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(
      wntAmount.add(feeAmount)
    );
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(usdcAmount);
    // relayer balance
    expect(await wnt.balanceOf(GELATO_RELAY_ADDRESS)).to.eq(0);

    // 2. create deposit
    const defaultDepositParams = {
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
      executionFee: executionFee, // 0.004 ETH
      callbackGasLimit: "200000",
      dataList: [],
    };

    const createDepositParams: Parameters<typeof sendCreateDeposit>[0] = {
      sender: relaySigner,
      signer: user1,
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
      account: user1.address,
      params: defaultDepositParams,
      deadline: 9999999999,
      chainId,
      srcChainId: chainId, // 0 would mean same chain action
      desChainId: chainId,
      relayRouter: multichainGmRouter,
      relayFeeToken: wnt.address,
      relayFeeAmount: relayFeeAmount, // 0.002 ETH
    };

    await sendCreateDeposit(createDepositParams);

    // funds are moved from multichainVault to depositVault
    expect(await wnt.balanceOf(depositVault.address)).eq(wntAmount.add(executionFee));
    expect(await usdc.balanceOf(depositVault.address)).eq(usdcAmount);
    // multichainVault balance
    expect(await wnt.balanceOf(multichainVault.address)).eq(0);
    expect(await usdc.balanceOf(multichainVault.address)).eq(0);
    expect(await getBalanceOf(ethUsdMarket.marketToken, multichainVault.address)).eq(0); // 0 GM
    // user's multichain balance
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(0);
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(0);
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdMarket.marketToken))).to.eq(0); // 0 GM
    // relayer balance
    expect(await wnt.balanceOf(GELATO_RELAY_ADDRESS)).to.eq(relayFeeAmount);
    // market token balances
    expect(await wnt.balanceOf(ethUsdMarket.marketToken)).eq(0);
    expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(0);

    await executeDeposit(fixture, { gasUsageLabel: "executeDeposit" });

    // funds moved from depositVault to market
    expect(await wnt.balanceOf(depositVault.address)).eq(0);
    expect(await usdc.balanceOf(depositVault.address)).eq(0);

    // multichainVault balance
    expect(await usdc.balanceOf(multichainVault.address)).eq(0);
    expect(await wnt.balanceOf(multichainVault.address)).to.approximately(
      "2095383984763072", // ~0.0021 ETH --> execution fee refunds (from deposit)
      expandDecimals(1, 12)
    );
    expect(await getBalanceOf(ethUsdMarket.marketToken, multichainVault.address)).eq(expandDecimals(95_000, 18)); // 95,000 GM
    expect(await wnt.balanceOf(ethUsdMarket.marketToken)).eq(wntAmount);
    expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(usdcAmount);
    // user's multichain balance
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.approximately(
      "2095383984763072",
      expandDecimals(1, 12)
    );
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(0);
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdMarket.marketToken))).to.eq(
      expandDecimals(95_000, 18)
    ); // 95,000 GM
    // relayer balance
    expect(await wnt.balanceOf(GELATO_RELAY_ADDRESS)).to.eq(relayFeeAmount);

    // 3. create glvDeposit
    const defaultGlvDepositParams = {
      addresses: {
        glv: ethUsdGlvAddress,
        receiver: user1.address,
        callbackContract: user2.address,
        uiFeeReceiver: user2.address,
        market: ethUsdMarket.marketToken,
        initialLongToken: ethers.constants.AddressZero,
        initialShortToken: ethers.constants.AddressZero,
        longTokenSwapPath: [],
        shortTokenSwapPath: [],
      },
      minGlvTokens: 100,
      executionFee: executionFee, // 0.004 ETH
      callbackGasLimit: "200000",
      shouldUnwrapNativeToken: true,
      isMarketTokenDeposit: true,
      dataList: [],
    };

    const createGlvDepositParams: Parameters<typeof sendCreateGlvDeposit>[0] = {
      sender: relaySigner,
      signer: user1,
      feeParams: {
        feeToken: wnt.address,
        feeAmount: feeAmount, // 0.006 ETH
        feeSwapPath: [],
      },
      transferRequests: {
        tokens: [ethUsdMarket.marketToken],
        receivers: [glvVault.address],
        amounts: [expandDecimals(47_500, 18)], // 47.5k GM (50% of his GM tokens)
      },
      account: user1.address,
      params: defaultGlvDepositParams,
      deadline: 9999999999,
      chainId,
      srcChainId: chainId,
      desChainId: chainId,
      relayRouter: multichainGlvRouter,
      relayFeeToken: wnt.address,
      relayFeeAmount: relayFeeAmount, // 0.002 ETH
    };

    expect(await getBalanceOf(ethUsdMarket.marketToken, ethUsdGlvAddress)).eq(0); // GM
    expect(await getBalanceOf(ethUsdMarket.marketToken, glvVault.address)).eq(0); // GM
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdGlvAddress))).eq(0); // GLV

    await bridgeInTokens(fixture, { account: user1, amount: feeAmount });
    await sendCreateGlvDeposit(createGlvDepositParams);

    // after glv deposit is created (user has 47.5k GM and 0 GLV, 47.5k of his GM moved from user's multichain balance to glvVault)
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdMarket.marketToken))).eq(
      expandDecimals(47_500, 18)
    ); // GM
    expect(await getBalanceOf(ethUsdMarket.marketToken, ethUsdGlvAddress)).eq(0); // GM
    expect(await getBalanceOf(ethUsdMarket.marketToken, glvVault.address)).eq(expandDecimals(47_500, 18)); // GM
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdGlvAddress))).eq(0); // GLV
    // relayer balance
    expect(await wnt.balanceOf(GELATO_RELAY_ADDRESS)).to.eq(relayFeeAmount.mul(2)); // 2 * 0.002 ETH = 0.004 ETH

    await executeGlvDeposit(fixture, { gasUsageLabel: "executeGlvDeposit" });

    // after glv deposit is executed (user has 47.5k GM and 47.5k GLV, 47.5k of his GM moved from glvVault to glv pool)
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdMarket.marketToken))).eq(
      expandDecimals(47_500, 18)
    ); // GM
    expect(await getBalanceOf(ethUsdMarket.marketToken, ethUsdGlvAddress)).eq(expandDecimals(47_500, 18)); // GM
    expect(await getBalanceOf(ethUsdMarket.marketToken, glvVault.address)).eq(0); // GM
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdGlvAddress))).eq(
      expandDecimals(47_500, 18)
    ); // GLV
    // user's multichain assets
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.approximately(
      "5101872976814984", // 0.0051 ETH --> execution fee refunds (from deposit + glvDeposit)
      expandDecimals(1, 12)
    );
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(0);

    // 4. create glvWithdrawal
    const defaultGlvWithdrawalParams = {
      addresses: {
        receiver: user1.address,
        callbackContract: user2.address,
        uiFeeReceiver: user2.address,
        market: ethUsdMarket.marketToken,
        glv: ethUsdGlvAddress,
        longTokenSwapPath: [],
        shortTokenSwapPath: [],
      },
      minLongTokenAmount: 0,
      minShortTokenAmount: 0,
      shouldUnwrapNativeToken: false,
      executionFee: executionFee, // 0.004 ETH
      callbackGasLimit: "200000",
      dataList: [],
    };

    const createGlvWithdrawalParams: Parameters<typeof sendCreateGlvWithdrawal>[0] = {
      sender: relaySigner,
      signer: user1,
      feeParams: {
        feeToken: wnt.address,
        feeAmount: feeAmount, // 0.006 ETH
        feeSwapPath: [],
      },
      transferRequests: {
        tokens: [ethUsdGlvAddress],
        receivers: [glvVault.address],
        amounts: [expandDecimals(47_500, 18)],
      },
      account: user1.address,
      params: defaultGlvWithdrawalParams,
      deadline: 9999999999,
      chainId,
      srcChainId: chainId,
      desChainId: chainId,
      relayRouter: multichainGlvRouter,
      relayFeeToken: wnt.address,
      relayFeeAmount: relayFeeAmount, // 0.002 ETH
    };

    // before glv withdrawal is created (user has 47.5k GM and 47.5k GLV, 47.5k of user's initial GM tokens are now in ethUsdGlv)
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdMarket.marketToken))).eq(
      expandDecimals(47_500, 18)
    ); // user's GM
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdGlvAddress))).eq(
      expandDecimals(47_500, 18)
    ); // user's GLV
    expect(await getBalanceOf(ethUsdGlvAddress, glvVault.address)).eq(0); // GLV in glvVault
    expect(await getBalanceOf(ethUsdMarket.marketToken, ethUsdGlvAddress)).eq(expandDecimals(47_500, 18)); // GM in ethUsdGlv

    await bridgeInTokens(fixture, { account: user1, amount: feeAmount });
    await sendCreateGlvWithdrawal(createGlvWithdrawalParams);

    // before glv withdrawal is executed (user has 47.5k GM and 47.5k GLV)
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdMarket.marketToken))).eq(
      expandDecimals(47_500, 18)
    ); // user's GM
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdGlvAddress))).eq(0); // user's GLV moved to glvVault
    expect(await getBalanceOf(ethUsdGlvAddress, glvVault.address)).eq(expandDecimals(47_500, 18)); // GLV in glvVault
    expect(await getBalanceOf(ethUsdMarket.marketToken, ethUsdGlvAddress)).eq(expandDecimals(47_500, 18)); // GM
    // user's multicahin assets
    // expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).eq(0);
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).eq(0);
    // relayer balance
    expect(await wnt.balanceOf(GELATO_RELAY_ADDRESS)).to.eq(relayFeeAmount.mul(3)); // 3 * 0.002 ETH = 0.006 ETH

    await executeGlvWithdrawal(fixture, { gasUsageLabel: "executeGlvWithdrawal" });

    // after glv withdrawal is executed (user has 47.5k GM, 0 GLV and receives back 5 ETH and 22.5k USDC)
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdGlvAddress))).eq(0); // GLV
    // user's multicahin assets
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.approximately(
      wntAmount
        .div(2) // 50% of WNT deposited
        .add("6744710957957688"), // execution fee refunds (from deposit + glvDeposit + glvWithdrawal)
      expandDecimals(5, 13)
    );
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).eq(
      usdcAmount.div(2) // 50% of USDC deposited
    ); // 22,500 USDC

    // 5. create withdrawal
    const defaultWithdrawalParams = {
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
      executionFee: executionFee,
      callbackGasLimit: "200000",
      dataList: [],
    };

    const createWithdrawalParams: Parameters<typeof sendCreateWithdrawal>[0] = {
      sender: relaySigner,
      signer: user1,
      feeParams: {
        feeToken: wnt.address,
        feeAmount: feeAmount,
        feeSwapPath: [],
      },
      transferRequests: {
        tokens: [ethUsdMarket.marketToken],
        receivers: [withdrawalVault.address],
        amounts: [expandDecimals(47_500, 18)],
      },
      account: user1.address,
      params: defaultWithdrawalParams,
      deadline: 9999999999,
      chainId,
      srcChainId: chainId,
      desChainId: chainId,
      relayRouter: multichainGmRouter,
      relayFeeToken: wnt.address,
      relayFeeAmount: relayFeeAmount,
    };

    // Verify initial state before withdrawal creation
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.approximately(
      wntAmount
        .div(2) // 50% of WNT deposited
        .add("6744710957957688"), // execution fee refunds (from deposit + glvDeposit + glvWithdrawal)
      expandDecimals(5, 13)
    );
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).eq(
      expandDecimals(22_500, 6)
    ); // 50% of USDC deposited
    expect(await wnt.balanceOf(withdrawalVault.address)).eq(0);
    expect(await usdc.balanceOf(withdrawalVault.address)).eq(0);
    expect(await getBalanceOf(ethUsdMarket.marketToken, multichainVault.address)).eq(expandDecimals(47_500, 18)); // 47,500 GM
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdMarket.marketToken))).to.eq(
      expandDecimals(47_500, 18)
    ); // 47,500 GM

    // Create withdrawal
    await bridgeInTokens(fixture, { account: user1, amount: feeAmount });
    await sendCreateWithdrawal(createWithdrawalParams);

    // user's multichain balance
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.approximately(
      wntAmount
        .div(2) // 50% of WNT deposited
        .add("6744710957957688"), // execution fee refunds (from deposit + glvDeposit + glvWithdrawal)
      expandDecimals(5, 13)
    );
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(
      expandDecimals(22_500, 6)
    ); // 50% of USDC deposited
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdMarket.marketToken))).to.eq(0); // GM moved from user's multichain balance to withdrawalVault
    // relayer balance
    expect(await wnt.balanceOf(GELATO_RELAY_ADDRESS)).to.eq(relayFeeAmount.mul(4)); // 4 * 0.002 ETH = 0.008 ETH
    // market token balances
    expect(await wnt.balanceOf(ethUsdMarket.marketToken)).eq(expandDecimals(5, 18)); // 5 ETH
    expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(expandDecimals(22_500, 6)); // 22,500 USDC

    expect(await wnt.balanceOf(withdrawalVault.address)).eq(expandDecimals(4, 15)); // 0.004 ETH --> executionFee sent to withdrawalVault
    expect(await usdc.balanceOf(withdrawalVault.address)).eq(0);
    expect(await getBalanceOf(ethUsdMarket.marketToken, withdrawalVault.address)).eq(expandDecimals(47_500, 18)); // GM tokens transferred into withdrawalVault

    await executeWithdrawal(fixture, { gasUsageLabel: "executeWithdrawal" });

    // user's multichain balance
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.approximately(
      wntAmount // 100% of WNT deposited
        .add("9228684945829480"), // execution fee refunds (from deposit + glvDeposit + glvWithdrawal + withdrawal)
      expandDecimals(5, 13)
    );
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(
      expandDecimals(45_000, 6)
    ); // 100% of USDC deposited
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, ethUsdMarket.marketToken))).to.eq(0);
    // market token balances
    expect(await wnt.balanceOf(ethUsdMarket.marketToken)).eq(0);
    expect(await usdc.balanceOf(ethUsdMarket.marketToken)).eq(0);

    // 5. bridge out
    const bridgeOutAmount = expandDecimals(10000, 6); // 10,000 USDC
    const bridgeOutFee = await mockStargatePoolNative.BRIDGE_OUT_FEE();
    const defaultBridgeOutParams = {
      token: usdc.address,
      amount: bridgeOutAmount,
      minAmountOut: 0,
      provider: mockStargatePoolUsdc.address,
      data: ethers.utils.defaultAbiCoder.encode(["uint32"], [1]), // dstEid = 1 (destination endpoint ID)
    };

    const bridgeOutParams: Parameters<typeof sendBridgeOut>[0] = {
      sender: relaySigner,
      signer: user1,
      feeParams: {
        feeToken: wnt.address,
        feeAmount: relayFeeAmount,
        feeSwapPath: [],
      },
      account: user1.address,
      params: defaultBridgeOutParams,
      deadline: 9999999999,
      srcChainId: 1, // 0 means non-multichain action
      desChainId: chainId, // for non-multichain actions, desChainId is the same as chainId
      relayRouter: multichainTransferRouter,
      relayFeeToken: wnt.address,
      relayFeeAmount: relayFeeAmount,
    };

    await dataStore.setBool(keys.isSrcChainIdEnabledKey(1), true); // bridgeOutParams.srcChainId
    await dataStore.setUint(keys.eidToSrcChainId(await mockStargatePoolUsdc.SRC_EID()), bridgeOutParams.srcChainId);

    expect(await usdc.balanceOf(user1.address)).eq(0);
    const wntBalanceBefore = await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address));
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(usdcAmount);
    expect(await hre.ethers.provider.getBalance(mockStargatePoolUsdc.address)).eq(0); // 0 ETH

    await sendBridgeOut(bridgeOutParams);

    expect(await usdc.balanceOf(user1.address)).eq(bridgeOutAmount);
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(
      wntBalanceBefore.sub(bridgeOutFee).sub(relayFeeAmount)
    );
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(
      usdcAmount.sub(bridgeOutAmount)
    );
    expect(await hre.ethers.provider.getBalance(mockStargatePoolUsdc.address)).eq(bridgeOutFee); // 0.001 ETH
  });
});
