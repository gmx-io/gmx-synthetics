import { expect } from "chai";

import { scenes } from "../../scenes";
import { deployFixture } from "../../../utils/fixture";
import { DecreasePositionSwapType } from "../../../utils/order";
import { expandDecimals, decimalToFloat } from "../../../utils/math";
import { getPoolAmount } from "../../../utils/market";

describe("Exchange.DecreasePosition", () => {
  let fixture;
  let user1;
  let dataStore, ethUsdMarket, wnt, usdc;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ user1 } = fixture.accounts);
    ({ dataStore, ethUsdMarket, wnt, usdc } = fixture.contracts);

    await scenes.deposit(fixture);
  });

  it("DecreasePositionSwapType: SwapPnlTokenToCollateralToken, positive pnl, unable to swap", async () => {
    // reserve short tokens to cause decrease position swap to fail
    await scenes.increasePosition.short(fixture, {
      create: {
        sizeDeltaUsd: decimalToFloat(500_000),
      },
    });

    await scenes.increasePosition.long(fixture);

    expect(await wnt.balanceOf(user1.address)).eq(0);
    expect(await usdc.balanceOf(user1.address)).eq(0);

    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq(expandDecimals(1000, 18));
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(1_000_000, 6));

    await scenes.decreasePosition.long.positivePnl(fixture, {
      create: {
        receiver: user1,
        initialCollateralDeltaAmount: 0,
        decreasePositionSwapType: DecreasePositionSwapType.SwapPnlTokenToCollateralToken,
      },
    });

    expect(await wnt.balanceOf(user1.address)).eq("15936254980079681"); // 0.015936254980079681 ETH, ~80 USD
    expect(await usdc.balanceOf(user1.address)).eq("0");

    // 1000 - 0.015936254980079681 => 999.984063745
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, wnt.address)).eq("999984063745019920319"); // 999.984063745019920319
    expect(await getPoolAmount(dataStore, ethUsdMarket.marketToken, usdc.address)).eq(expandDecimals(1_000_000, 6));
  });
});
