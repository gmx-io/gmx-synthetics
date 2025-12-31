import { deployFixture } from "../../utils/fixture";
import { REENTRANCY_CASES, ReentrancyCaseContext } from "./cases";

describe.only("Reentrancy", () => {
  let ctx: ReentrancyCaseContext;

  beforeEach(async () => {
    const fixture = await deployFixture();
    const { user0 } = fixture.accounts;
    const { dataStore, exchangeRouter, orderHandler, ethUsdMarket, wnt } = fixture.contracts;
    const { executionFee } = fixture.props;

    ctx = {
      fixture,
      user0,
      dataStore,
      exchangeRouter,
      orderHandler,
      ethUsdMarket,
      wnt,
      executionFee,
    };
  });

  const cases = Object.entries(REENTRANCY_CASES).sort(([a], [b]) => a.localeCompare(b));
  console.log("cases", cases);
  for (const [name, run] of cases) {
    it(name, async () => {
      await run(ctx);
    });
  }
});
