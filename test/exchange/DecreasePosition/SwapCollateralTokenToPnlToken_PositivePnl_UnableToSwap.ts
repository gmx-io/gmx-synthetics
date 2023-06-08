import { expect } from "chai";

import { scenes } from "../../scenes";
import { deployFixture } from "../../../utils/fixture";
import { DecreasePositionSwapType } from "../../../utils/order";
import { expandDecimals, decimalToFloat } from "../../../utils/math";

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

  it("DecreasePositionSwapType: SwapCollateralTokenToPnlToken, positive pnl, unable to swap", async () => {
    await scenes.increasePosition.long(fixture, {
      create: {
        sizeDeltaUsd: decimalToFloat(2_500_000),
        initialCollateralDeltaAmount: expandDecimals(500_000, 6),
      },
    });

    expect(await wnt.balanceOf(user1.address)).eq(0);
    expect(await usdc.balanceOf(user1.address)).eq(0);

    await scenes.decreasePosition.long.positivePnl(fixture, {
      create: {
        receiver: user1,
        initialCollateralDeltaAmount: expandDecimals(100_000, 6),
        decreasePositionSwapType: DecreasePositionSwapType.SwapCollateralTokenToPnlToken,
      },
    });

    expect(await wnt.balanceOf(user1.address)).eq("15936254980079681"); // 0.015936254980079681 ETH, ~80 USD
    expect(await usdc.balanceOf(user1.address)).eq(expandDecimals(100_000, 6));
  });
});
