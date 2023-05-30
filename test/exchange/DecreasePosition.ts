import { expect } from "chai";

import { usingResult } from "../../utils/use";
import { getMarketTokenPriceWithPoolValue } from "../../utils/market";
import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { getSupplyOf } from "../../utils/token";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, getOrderCount, getOrderKeys, createOrder, executeOrder, handleOrder } from "../../utils/order";
import { getPositionCount, getAccountPositionCount, getPositionKeys } from "../../utils/position";
import { getExecuteParams } from "../../utils/exchange";
import { errorsContract } from "../../utils/error";
import * as keys from "../../utils/keys";

// check collateral amount, market token price, pool amount, position impact pool amount, fees
describe("Exchange.DecreasePosition", () => {
  it("DecreasePositionSwapType: SwapPnlTokenToCollateralToken, positive pnl", async () => {
    // to be added
  });

  it("DecreasePositionSwapType: SwapPnlTokenToCollateralToken, positive pnl, unable to swap", async () => {
    // to be added
  });

  it("DecreasePositionSwapType: SwapCollateralTokenToPnlToken, positive pnl", async () => {
    // to be added
  });

  it("negative pnl", async () => {
    // to be added
  });

  it("capped price impact, positive pnl", async () => {
    // to be added
  });

  it("capped price impact, negative pnl", async () => {
    // to be added
  });

  it("spread, positive pnl", async () => {
    // to be added
  });

  it("spread, negative pnl", async () => {
    // to be added
  });

  it("spread, positive pnl, positive price impact, capped price impact", async () => {
    // to be added
  });

  it("spread, positive pnl, negative price impact", async () => {
    // to be added
  });

  it("spread, negative pnl, positive price impact, capped price impact", async () => {
    // to be added
  });

  it("spread, negative pnl, negative price impact", async () => {
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
