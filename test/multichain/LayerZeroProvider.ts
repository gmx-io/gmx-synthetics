import { expect } from "chai";

import * as keys from "../../utils/keys";
import { deployFixture } from "../../utils/fixture";
import { expandDecimals } from "../../utils/math";
import { mintAndBridge } from "../../utils/multichain";
import { errorsContract } from "../../utils/error";

describe("LayerZeroProvider", () => {
  let fixture;
  let user0, user1;
  let dataStore, usdc, wnt, multichainVault, layerZeroProvider, mockStargatePoolUsdc, mockStargatePoolWnt;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1 } = fixture.accounts);
    ({ dataStore, usdc, wnt, multichainVault, layerZeroProvider, mockStargatePoolUsdc, mockStargatePoolWnt } =
      fixture.contracts);
  });

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
