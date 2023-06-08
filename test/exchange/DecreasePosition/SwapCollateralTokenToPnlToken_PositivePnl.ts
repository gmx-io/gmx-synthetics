import { expect } from "chai";

import { scenes } from "../../scenes";
import { deployFixture } from "../../../utils/fixture";
import { DecreasePositionSwapType } from "../../../utils/order";
import { expandDecimals } from "../../../utils/math";

describe("Exchange.DecreasePosition", () => {
  let fixture;
  let user1;
  let wnt, usdc;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ user1 } = fixture.accounts);
    ({ wnt, usdc } = fixture.contracts);

    await scenes.deposit(fixture);
  });

  it("DecreasePositionSwapType: SwapCollateralTokenToPnlToken, positive pnl", async () => {
    await scenes.increasePosition.long(fixture);

    expect(await wnt.balanceOf(user1.address)).eq(0);
    expect(await usdc.balanceOf(user1.address)).eq(0);

    await scenes.decreasePosition.long.positivePnl(fixture, {
      create: {
        receiver: user1,
        initialCollateralDeltaAmount: expandDecimals(200, 6),
        decreasePositionSwapType: DecreasePositionSwapType.SwapCollateralTokenToPnlToken,
      },
    });

    expect(await wnt.balanceOf(user1.address)).eq("55776892430278884"); // 0.055776892430278884 ETH, ~280 USD
    expect(await usdc.balanceOf(user1.address)).eq("0");
  });
});
