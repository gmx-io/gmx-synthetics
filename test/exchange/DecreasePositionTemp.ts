import { expect } from "chai";

import { usingResult } from "../../utils/use";
import { scenes } from "../scenes";
import { deployFixture } from "../../utils/fixture";
import { DecreasePositionSwapType } from "../../utils/order";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { getPositionKey } from "../../utils/position";
import { getPoolAmount, getMarketTokenPriceWithPoolValue } from "../../utils/market";
import * as keys from "../../utils/keys";

describe("Exchange.DecreasePosition", () => {
  let fixture;
  let user0, user1;
  let reader, dataStore, referralStorage, ethUsdMarket, wnt, usdc;

  const defaultMarketPrices = {
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

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ user0, user1 } = fixture.accounts);
    ({ reader, dataStore, referralStorage, ethUsdMarket, wnt, usdc } = fixture.contracts);

    await scenes.deposit(fixture);
  });

  it("capped pnl", async () => {
    // to be added
  });

  it("liquidation due to pnl", async () => {
    // to be added
  });

  it("liquidation due to fees", async () => {
    // to be added
  });

  it("adl", async () => {
    // to be added
  });

  it("adl, insufficient funds to pay funding fees", async () => {
    // to be added
  });

  it("adl, funding fees paid in secondary output token", async () => {
    // to be added
  });

  it("adl, funding fees paid, insufficient funds to pay fees", async () => {
    // to be added
  });
});
