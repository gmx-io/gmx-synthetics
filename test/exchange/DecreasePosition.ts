import { expect } from "chai";

import { usingResult } from "../../utils/use";
import { scenes } from "../scenes";
import { deployFixture } from "../../utils/fixture";
import { DecreasePositionSwapType } from "../../utils/order";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { getPositionKey } from "../../utils/position";

// check collateral amount, market token price, pool amount, position impact pool amount, fees
describe("Exchange.DecreasePosition", () => {
  let fixture;
  let user0, user1;
  let reader, dataStore, referralStorage, ethUsdMarket, wnt, usdc;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ user0, user1 } = fixture.accounts);
    ({ reader, dataStore, referralStorage, ethUsdMarket, wnt, usdc } = fixture.contracts);

    await scenes.deposit(fixture);
  });

  it("DecreasePositionSwapType: SwapPnlTokenToCollateralToken, positive pnl", async () => {
    await scenes.increasePosition.long(fixture);

    expect(await wnt.balanceOf(user1.address)).eq(0);
    expect(await usdc.balanceOf(user1.address)).eq(0);

    await scenes.decreasePosition.long.positivePnl(fixture, {
      create: {
        receiver: user1,
        initialCollateralDeltaAmount: 0,
        decreasePositionSwapType: DecreasePositionSwapType.SwapPnlTokenToCollateralToken,
      },
    });

    expect(await wnt.balanceOf(user1.address)).eq(0);
    expect(await usdc.balanceOf(user1.address)).eq("79999999"); // ~80
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

    await scenes.decreasePosition.long.positivePnl(fixture, {
      create: {
        receiver: user1,
        initialCollateralDeltaAmount: 0,
        decreasePositionSwapType: DecreasePositionSwapType.SwapPnlTokenToCollateralToken,
      },
    });

    expect(await wnt.balanceOf(user1.address)).eq("15936254980079681"); // 0.015936254980079681 ETH, ~80 USD
    expect(await usdc.balanceOf(user1.address)).eq("0");
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

  it("negative pnl", async () => {
    await scenes.increasePosition.long(fixture);

    expect(await wnt.balanceOf(user1.address)).eq(0);
    expect(await usdc.balanceOf(user1.address)).eq(0);

    await scenes.decreasePosition.long.negativePnl(fixture, {
      create: {
        receiver: user1,
        initialCollateralDeltaAmount: 0,
      },
    });

    expect(await wnt.balanceOf(user1.address)).eq(0);
    expect(await usdc.balanceOf(user1.address)).eq(0);

    const positionKey0 = getPositionKey(user0.address, ethUsdMarket.marketToken, usdc.address, true);

    const marketPrices = {
      indexTokenPrice: {
        min: expandDecimals(5000, 12),
        max: expandDecimals(5000, 12),
      },
      longTokenPrice: {
        min: expandDecimals(5000, 12),
        max: expandDecimals(5000, 12),
      },
      shortTokenPrice: {
        min: expandDecimals(1, 6),
        max: expandDecimals(1, 6),
      },
    };

    await usingResult(
      reader.getPositionInfo(
        dataStore.address,
        referralStorage.address,
        positionKey0,
        marketPrices,
        0,
        ethers.constants.AddressZero,
        true
      ),
      (positionInfo) => {
        expect(positionInfo.position.numbers.collateralAmount).eq(expandDecimals("49920", 6));
        expect(positionInfo.position.numbers.sizeInTokens).eq(expandDecimals(36, 18));
        expect(positionInfo.position.numbers.sizeInUsd).eq(decimalToFloat(180_000));
      }
    );
  });

  // it("capped price impact, positive pnl", async () => {
  //   // to be added
  // });
  //
  // it("capped price impact, negative pnl", async () => {
  //   // to be added
  // });
  //
  // it("spread, positive pnl", async () => {
  //   // to be added
  // });
  //
  // it("spread, negative pnl", async () => {
  //   // to be added
  // });
  //
  // it("spread, positive pnl, positive price impact, capped price impact", async () => {
  //   // to be added
  // });
  //
  // it("spread, positive pnl, negative price impact", async () => {
  //   // to be added
  // });
  //
  // it("spread, negative pnl, positive price impact, capped price impact", async () => {
  //   // to be added
  // });
  //
  // it("spread, negative pnl, negative price impact", async () => {
  //   // to be added
  // });
  //
  // it("liquidation due to pnl", async () => {
  //   // to be added
  // });
  //
  // it("liquidation due to fees", async () => {
  //   // to be added
  // });
  //
  // it("adl", async () => {
  //   // to be added
  // });
  //
  // it("adl, insufficient funds to pay funding fees", async () => {
  //   // to be added
  // });
  //
  // it("adl, funding fees paid in secondary output token", async () => {
  //   // to be added
  // });
  //
  // it("adl, funding fees paid, insufficient funds to pay fees", async () => {
  //   // to be added
  // });
});
