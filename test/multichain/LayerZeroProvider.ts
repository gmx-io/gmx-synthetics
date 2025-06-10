import { expect } from "chai";
import { BigNumber } from "ethers";

import * as keys from "../../utils/keys";
import { deployFixture } from "../../utils/fixture";
import { expandDecimals } from "../../utils/math";
import { mintAndBridge } from "../../utils/multichain";
import { errorsContract } from "../../utils/error";
import { GELATO_RELAY_ADDRESS } from "../../utils/relay/addresses";
import { getRelayParams } from "../../utils/relay/helpers";
import { encodeDepositData } from "./utils";

describe("LayerZeroProvider", () => {
  let fixture;
  let user0, user1, user2;
  let dataStore,
    usdc,
    wnt,
    multichainVault,
    layerZeroProvider,
    mockStargatePoolUsdc,
    mockStargatePoolWnt,
    multichainGmRouter,
    ethUsdMarket,
    depositVault;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1, user2 } = fixture.accounts);
    ({
      dataStore,
      usdc,
      wnt,
      multichainVault,
      layerZeroProvider,
      mockStargatePoolUsdc,
      mockStargatePoolWnt,
      multichainGmRouter,
      ethUsdMarket,
      depositVault,
    } = fixture.contracts);
  });

  describe("lzCompose", async () => {
    it("lzCompose with USDC", async () => {
      await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolUsdc.address), true);
      await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolUsdc.address), true);

      const amount = expandDecimals(1000, 6);

      await mintAndBridge(fixture, {
        token: usdc,
        tokenAmount: amount,
      });

      // usdc has been transferred from LayerZeroProvider to MultichainVault and recorded under the user's multichain balance
      expect(await usdc.balanceOf(layerZeroProvider.address)).eq(0);
      expect(await usdc.balanceOf(multichainVault.address)).eq(amount);
      expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, usdc.address))).eq(amount);
    });

    it("lzCompose with WNT", async () => {
      await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolWnt.address), true);
      await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolWnt.address), true);

      const amount = expandDecimals(1, 18); // 1 WNT

      await mintAndBridge(fixture, {
        token: wnt,
        tokenAmount: amount,
      });

      // WNT has been transferred from LayerZeroProvider to MultichainVault and recorded under the user's multichain balance
      expect(await wnt.balanceOf(layerZeroProvider.address)).eq(0);
      expect(await wnt.balanceOf(multichainVault.address)).eq(amount);
      expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, wnt.address))).eq(amount);
    });
  });

  describe("Deposit Action", () => {
    let createDepositParams;

    let depositActionParams, defaultDepositParams;
    let relayParams;

    const wntAmount = expandDecimals(10, 18);
    const usdcAmount = expandDecimals(45_000, 6);
    const feeAmount = expandDecimals(6, 15);
    const desChainId = 120;

    beforeEach(async () => {
      await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePoolUsdc.address), true);
      await dataStore.setBool(keys.isMultichainEndpointEnabledKey(mockStargatePoolUsdc.address), true);

      const relaySigner = await hre.ethers.getSigner(GELATO_RELAY_ADDRESS);
      const chainId = await hre.ethers.provider.getNetwork().then((network) => network.chainId);

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
        desChainId: desChainId,
        relayRouter: multichainGmRouter,
        relayFeeToken: wnt.address,
        relayFeeAmount: expandDecimals(2, 15), // 0.002 ETH
      };

      relayParams = await getRelayParams(createDepositParams);
      relayParams.signature = "0x";

      depositActionParams = {
        relayParams: relayParams,
        transferRequests: {
          tokens: [wnt.address, usdc.address],
          receivers: [depositVault.address, depositVault.address],
          amounts: [wntAmount, usdcAmount],
        },
        depositParams: defaultDepositParams,
      };
    });

    it("creates deposit when bridging with deposit data", async () => {
      const amount = expandDecimals(1000, 6);
      const srcChainId = 1;

      // const relayAbiTypes = `tuple(
      //     tuple(address[] tokens, address[] providers, bytes[] data),
      //     tuple(address[] sendTokens,uint256[] sendAmounts,address[] externalCallTargets, bytes[] externalCallDataList, address[] refundTokens, address[] refundReceivers),
      //     tuple(address owner,address spender,uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s,address token)[] tokenPermits,
      //     tuple(address feeToken, uint256 feeAmount, address[] feeSwapPath),
      //     uint256 userNonce,
      //     uint256 deadline,
      //     bytes signature,
      //     uint256 desChainId
      // )`;
      // const transferRequestsAbiTypes = `tuple(address[], address[], uint256[])`;
      // const depositPramsAbiTypes =
      // `tuple(
      //   tuple(address receiver,address callbackContract,address uiFeeReceiver,address market,address initialLongToken,
      //   address initialShortToken,address[] longTokenSwapPath,address[] shortTokenSwapPath),
      //   uint256, bool, uint256, uint256, bytes32[]
      // )`;
      //
      // const abiTypes = [
      //   relayAbiTypes,
      //   transferRequestsAbiTypes,
      //   depositPramsAbiTypes
      // ];
      //
      // const abiValues = [
      //   // RelayParams
      //   [
      //     [relayParams.oracleParams.tokens, relayParams.oracleParams.providers, relayParams.oracleParams.data],
      //     relayParams.externalCalls,
      //     relayParams.tokenPermits.map((permit) => [
      //       permit.owner,
      //       permit.spender,
      //       permit.value,
      //       permit.deadline,
      //       permit.v,
      //       permit.r,
      //       permit.s,
      //       permit.token,
      //     ]),
      //     [relayParams.fee.feeToken, relayParams.fee.feeAmount, relayParams.fee.feeSwapPath],
      //     relayParams.userNonce,
      //     relayParams.deadline,
      //     relayParams.signature,
      //     relayParams.desChainId,
      //   ],
      //
      //   // // TransferRequests
      //   [
      //     [wnt.address, usdc.address],
      //     [depositVault.address, depositVault.address],
      //     [wntAmount, usdcAmount],
      //   ],
      //   //
      //   //CreateDeposit
      //   // CreateDepositParamsAddresses
      //   [
      //     [defaultDepositParams.addresses.receiver, defaultDepositParams.addresses.callbackContract,
      //       defaultDepositParams.addresses.uiFeeReceiver, defaultDepositParams.addresses.market,
      //       defaultDepositParams.addresses.initialLongToken, defaultDepositParams.addresses.initialShortToken,
      //       defaultDepositParams.addresses.longTokenSwapPath, defaultDepositParams.addresses.shortTokenSwapPath],
      //
      //     defaultDepositParams.minMarketTokens, defaultDepositParams.shouldUnwrapNativeToken,
      //     defaultDepositParams.executionFee, defaultDepositParams.callbackGasLimit,
      //     defaultDepositParams.dataList,
      //   ],
      // ];
      // const depositData = ethers.utils.defaultAbiCoder.encode(abiTypes, abiValues);

      const transferRequests = {
        tokens: [wnt.address, usdc.address],
        receivers: [depositVault.address, depositVault.address],
        amounts: [wntAmount, usdcAmount],
      };
      const depositData = encodeDepositData(relayParams, transferRequests, defaultDepositParams);
      const actionData = ethers.utils.defaultAbiCoder.encode(
        ["uint8", "bytes"],
        [1, depositData] // 1 is ActionType.Deposit
      );

      // Bridge tokens with deposit data
      await mintAndBridge(fixture, {
        token: usdc,
        tokenAmount: amount,
        data: actionData,
      });

      // Verify deposit was created
      expect(multichainGmRouter.createDeposit.callCount).to.equal(1);
      const createDepositCall = multichainGmRouter.createDeposit.getCall(0);
      expect(createDepositCall.args[1]).to.equal(user0.address); // account
      expect(createDepositCall.args[2]).to.equal(srcChainId); // srcChainId
    });

    it("reverts when deposit data is invalid", async () => {
      const amount = expandDecimals(1000, 6);

      // Create invalid deposit data
      const invalidDepositData = "0x1234";

      // Create action data with Deposit action type
      const actionData = ethers.utils.defaultAbiCoder.encode(
        ["uint8", "bytes"],
        [1, invalidDepositData] // 1 is ActionType.Deposit
      );

      // Bridge tokens with invalid deposit data
      await expect(
        mintAndBridge(fixture, {
          token: usdc,
          tokenAmount: amount,
          data: actionData,
        })
      ).to.be.reverted;
    });
  });

  describe("bridgeOut", async () => {
    it("bridgeOut with WNT", async () => {
      const amount = expandDecimals(1, 18); // 1 WNT
      const dstEid = 102; // Example destination endpoint ID
      const srcChainId = 1; // Example source chain ID

      // Set up initial WNT balance in user's multichain balance
      await dataStore.setUint(keys.multichainBalanceKey(user0.address, wnt.address), amount);
      await dataStore.setUint(keys.eidToSrcChainId(dstEid), srcChainId);
      await dataStore.setAddress(keys.HOLDING_ADDRESS, user1.address);

      // Bridge out WNT
      const bridgeOutParams = {
        provider: mockStargatePoolWnt.address,
        account: user0.address,
        token: wnt.address,
        amount: amount,
        srcChainId: srcChainId,
        data: ethers.utils.defaultAbiCoder.encode(["uint32"], [dstEid]),
      };

      // await layerZeroProvider.bridgeOut(user0.address, srcChainId, bridgeOutParams);

      // Verify WNT has been deducted from user's multichain balance
      // expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, wnt.address))).eq(0);
    });

    it("reverts bridgeOut with WNT when token is not WNT", async () => {
      const amount = expandDecimals(1, 18);
      const dstEid = 102;
      const srcChainId = 1;

      await dataStore.setUint(keys.multichainBalanceKey(user0.address, wnt.address), amount);
      await dataStore.setUint(keys.eidToSrcChainId(dstEid), srcChainId);

      // Try to bridge out USDC instead of WNT
      const bridgeOutParams = {
        provider: mockStargatePoolWnt.address,
        account: user0.address,
        token: usdc.address, // Using USDC instead of WNT
        amount: amount,
        srcChainId: srcChainId,
        data: ethers.utils.defaultAbiCoder.encode(["uint32"], [dstEid]),
      };

      await expect(layerZeroProvider.bridgeOut(user0.address, srcChainId, bridgeOutParams))
        .to.be.revertedWithCustomError(errorsContract, "InvalidBridgeOutToken")
        .withArgs(usdc.address);
    });
  });
});
