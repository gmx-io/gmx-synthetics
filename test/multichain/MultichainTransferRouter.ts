import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals } from "../../utils/math";
import { logGasUsage } from "../../utils/gas";
import * as keys from "../../utils/keys";
import { sendBridgeOut } from "../../utils/relay/multichain";
import { GELATO_RELAY_ADDRESS } from "../../utils/relay/addresses";
import { mintAndBridge } from "./MultichainRouter";

describe("MultichainTransferRouter", () => {
  let fixture;
  let user1;
  let dataStore, multichainVault, router, multichainTransferRouter, wnt, usdc, mockStargatePool;
  let chainId;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user1 } = fixture.accounts);
    ({ dataStore, multichainVault, router, multichainTransferRouter, wnt, usdc, mockStargatePool } = fixture.contracts);

    chainId = await hre.ethers.provider.getNetwork().then((network) => network.chainId);
  });

  it("bridgeIn wnt", async () => {
    const amount = expandDecimals(50, 18); // 50 ETH
    const user1EthBalanceBefore = await hre.ethers.provider.getBalance(user1.address);

    expect(await wnt.balanceOf(user1.address)).to.eq(0);
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(0);

    const tx = await multichainTransferRouter.connect(user1).multicall(
      [
        multichainTransferRouter.interface.encodeFunctionData("sendWnt", [multichainVault.address, amount]),
        multichainTransferRouter.interface.encodeFunctionData("bridgeIn", [
          user1.address, // account
          wnt.address, // token
          chainId, // srcChainId
        ]),
      ],
      { value: amount }
    );

    const user1EthBalanceAfter = await hre.ethers.provider.getBalance(user1.address);
    expect(user1EthBalanceAfter).to.approximately(user1EthBalanceBefore.sub(amount), expandDecimals(1, 15)); // account for gas ~0.0002 ETH
    expect(await wnt.balanceOf(user1.address)).to.eq(0);
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, wnt.address))).to.eq(amount);

    await logGasUsage({
      tx,
      label: "multichainTransferRouter.bridgeIn",
    });
  });

  it("bridgeIn usdc", async () => {
    const amount = expandDecimals(50 * 1000, 6); // 50,000 USDC
    await usdc.mint(user1.address, amount);
    await usdc.connect(user1).approve(router.address, amount);

    expect(await usdc.balanceOf(user1.address)).to.eq(amount);
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(0);

    const tx = await multichainTransferRouter.connect(user1).multicall([
      multichainTransferRouter.interface.encodeFunctionData("sendTokens", [
        usdc.address,
        multichainVault.address,
        amount,
      ]),
      multichainTransferRouter.interface.encodeFunctionData("bridgeIn", [
        user1.address, // account
        usdc.address, // token
        chainId, // srcChainId
      ]),
    ]);

    expect(await usdc.balanceOf(user1.address)).to.eq(0);
    expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(amount);

    await logGasUsage({
      tx,
      label: "multichainTransferRouter.bridgeIn",
    });
  });

  describe("bridgeOut", () => {
    let relaySigner;

    const feeAmount = expandDecimals(6, 15);
    const bridgeAmount = expandDecimals(1000, 6);

    let defaultBridgeOutParams;
    beforeEach(async () => {
      defaultBridgeOutParams = {
        token: usdc.address,
        amount: bridgeAmount,
      };
    });

    let bridgeOutParams: Parameters<typeof sendBridgeOut>[0];
    beforeEach(async () => {
      relaySigner = await hre.ethers.getSigner(GELATO_RELAY_ADDRESS);

      bridgeOutParams = {
        sender: relaySigner,
        signer: user1,
        feeParams: {
          feeToken: wnt.address,
          feeAmount: feeAmount,
          feeSwapPath: [],
        },
        provider: mockStargatePool.address,
        account: user1.address,
        data: "0x", // e.g. Eid
        params: defaultBridgeOutParams,
        deadline: 9999999999,
        srcChainId: chainId, // 0 means non-multichain action
        desChainId: chainId, // for non-multichain actions, desChainId is the same as chainId
        relayRouter: multichainTransferRouter,
        chainId,
        relayFeeToken: wnt.address,
        relayFeeAmount: feeAmount,
      };
    });

    // TODO: mock StargatePool and enable bridging out test
    it.skip("bridgeOut", async () => {
      await dataStore.setBool(keys.isMultichainProviderEnabledKey(mockStargatePool.address), true);
      await mintAndBridge(fixture, { account: user1, token: usdc, tokenAmount: bridgeAmount });

      expect(await usdc.balanceOf(user1.address)).eq(0);
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(bridgeAmount);

      await sendBridgeOut(bridgeOutParams);

      expect(await usdc.balanceOf(user1.address)).eq(bridgeAmount);
      expect(await dataStore.getUint(keys.multichainBalanceKey(user1.address, usdc.address))).to.eq(0);
    });
  });
});
