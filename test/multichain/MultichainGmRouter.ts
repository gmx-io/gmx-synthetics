import { expect } from "chai";
import { impersonateAccount, setBalance } from "@nomicfoundation/hardhat-network-helpers";

import { expandDecimals } from "../../utils/math";
import { deployFixture } from "../../utils/fixture";
import { GELATO_RELAY_ADDRESS } from "../../utils/relay/addresses";
import { getTokenPermit } from "../../utils/relay/tokenPermit";
import { sendCreateDeposit } from "../../utils/relay/multichain";
import * as keys from "../../utils/keys";

describe("MultichainGmRouter", () => {
  let fixture;
  let user0, user1, user2;
  let reader,
    dataStore,
    router,
    multichainGmRouter,
    multichainVault,
    depositVault,
    ethUsdMarket,
    wnt,
    usdc,
    layerZeroProvider,
    mockStargatePool;
  let relaySigner;
  let chainId;

  let defaultParams;
  let createDepositParams: Parameters<typeof sendCreateDeposit>[0];

  const wntAmount = expandDecimals(10, 18);
  const usdcAmount = expandDecimals(50000, 6);

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1, user2 } = fixture.accounts);
    ({
      reader,
      dataStore,
      router,
      multichainGmRouter,
      multichainVault,
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
    await setBalance(GELATO_RELAY_ADDRESS, expandDecimals(100, 18));
    await usdc.mint(user0.address, expandDecimals(1, 30)); // very large amount
    await wnt.mint(user0.address, expandDecimals(1, 30)); // very large amount

    relaySigner = await hre.ethers.getSigner(GELATO_RELAY_ADDRESS);
    chainId = await hre.ethers.provider.getNetwork().then((network) => network.chainId);

    createDepositParams = {
      sender: relaySigner,
      signer: user0,
      feeParams: {
        feeToken: wnt.address,
        feeAmount: expandDecimals(2, 15), // 0.002 ETH
        feeSwapPath: [],
      },
      tokenPermits: [],
      transferRequests: {
        tokens: [wnt.address, usdc.address],
        receivers: [multichainVault.address, multichainVault.address],
        amounts: [expandDecimals(1, 18), expandDecimals(50000, 6)],
      },
      account: user0.address,
      params: defaultParams,
      deadline: 9999999999,
      chainId,
      srcChainId: chainId, // 0 would mean same chain action
      desChainId: chainId, // for non-multichain actions, desChainId and srcChainId are the same
      relayRouter: multichainGmRouter,
      relayFeeToken: wnt.address,
      relayFeeAmount: expandDecimals(1, 15),
    };

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
      expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, wnt.address))).to.eq(wntAmount); // 10 ETH
      expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, usdc.address))).to.eq(usdcAmount); // 50k USDC

      console.log("user0 address: %s", user0.address);
      console.log("GELATO_RELAY_ADDRESS: %s", GELATO_RELAY_ADDRESS);
      console.log("router address: %s", router.address);
      console.log("multichainGmRouter address: %s", multichainGmRouter.address);
      console.log("multichainVault address: %s", multichainVault.address);
      console.log("depositVault address: %s", depositVault.address);

      await sendCreateDeposit(createDepositParams);

      expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, wnt.address))).to.eq(
        wntAmount.sub(createDepositParams.transferRequests[0].amount)
      ); // 9 ETH
      expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, usdc.address))).to.eq(
        usdcAmount.sub(createDepositParams.transferRequests[1].amount)
      ); // 45k USDC
    });
  });
});
