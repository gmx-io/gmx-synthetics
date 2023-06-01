// import { expect } from "chai";
import { scenes } from "../scenes";
import { deployFixture } from "../../utils/fixture";

// check collateral amount, market token price, pool amount, position impact pool amount, fees
describe("Exchange.DecreasePosition", () => {
  let fixture;

  beforeEach(async () => {
    fixture = await deployFixture();
    await scenes.deposit(fixture);
  });

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
