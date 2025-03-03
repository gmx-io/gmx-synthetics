import { expect } from "chai";

import * as keys from "../../utils/keys";
import { deployFixture } from "../../utils/fixture";
import { expandDecimals } from "../../utils/math";
import { mintAndBridge } from "./MultichainRouter";

describe("LayerZeroProvider", () => {
  let fixture;
  let user0;
  let dataStore, usdc, multichainVault, layerZeroProvider;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0 } = fixture.accounts);
    ({ dataStore, usdc, multichainVault, layerZeroProvider } = fixture.contracts);
  });

  it("lzCompose", async () => {
    const amount = expandDecimals(1000, 6);

    await mintAndBridge(fixture, {
      token: usdc,
      tokenAmount: amount,
    });

    // usdc has been transterred from LayerZeroProvider to MultichainVault and recorded under the user's multicahin balance
    expect(await usdc.balanceOf(layerZeroProvider.address)).eq(0);
    expect(await usdc.balanceOf(multichainVault.address)).eq(amount);
    expect(await dataStore.getUint(keys.multichainBalanceKey(user0.address, usdc.address))).eq(amount);
  });
});
