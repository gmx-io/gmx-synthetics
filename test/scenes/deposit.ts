import { handleDeposit } from "../../utils/deposit";
import { expandDecimals } from "../../utils/math";

export const deposit = async (fixture) => {
  const { ethUsdMarket } = fixture.contracts;
  await handleDeposit(fixture, {
    create: {
      market: ethUsdMarket,
      longTokenAmount: expandDecimals(1000, 18),
      shortTokenAmount: expandDecimals(1_000_000, 6),
    },
  });
};
