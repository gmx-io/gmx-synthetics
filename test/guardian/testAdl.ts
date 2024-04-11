import { expect } from "chai";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, decimalToFloat } from "../../utils/math";
import { handleDeposit } from "../../utils/deposit";
import { OrderType, handleOrder } from "../../utils/order";
import { getIsAdlEnabled, updateAdlState, executeAdl } from "../../utils/adl";
import { grantRole } from "../../utils/role";
import * as keys from "../../utils/keys";
import { getAccountPositionCount, getPositionKey } from "../../utils/position";
import { errorsContract } from "../../utils/error";
import { TOKEN_ORACLE_TYPES } from "../../utils/oracle";

describe("Guardian.AdlOrder", () => {
  let fixture;
  let wallet, user0;
  let roleStore, dataStore, ethUsdMarket, solUsdMarket, wnt, usdc, reader;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ wallet, user0 } = fixture.accounts);
    ({ roleStore, dataStore, ethUsdMarket, solUsdMarket, wnt, usdc, reader } = fixture.contracts);

    await handleDeposit(fixture, {
      create: {
        market: ethUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
      },
    });

    await handleDeposit(fixture, {
      create: {
        market: solUsdMarket,
        longTokenAmount: expandDecimals(1000, 18),
      },
      execute: {
        tokens: [solUsdMarket.indexToken, wnt.address, usdc.address],
        precisions: [8, 8, 18],
        minPrices: [expandDecimals(20, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(20, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
      },
    });
  });

  it("ADL cannot execute when PnL to pool ratio not exceeded", async () => {
    await handleOrder(fixture, {
      create: {
        market: solUsdMarket,
        initialCollateralToken: wnt,
        initialCollateralDeltaAmount: expandDecimals(100, 18),
        sizeDeltaUsd: decimalToFloat(2000 * 1000),
        acceptablePrice: expandDecimals(5001, 12),
        orderType: OrderType.MarketIncrease,
        isLong: true,
      },
      execute: {
        tokens: [solUsdMarket.indexToken, wnt.address, usdc.address],
        precisions: [8, 8, 18],
        minPrices: [expandDecimals(20, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(20, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
      },
    });

    const maxPnlFactorKey = keys.maxPnlFactorKey(keys.MAX_PNL_FACTOR, solUsdMarket.marketToken, true);
    const maxPnlFactorForAdlKey = keys.maxPnlFactorKey(keys.MAX_PNL_FACTOR_FOR_ADL, solUsdMarket.marketToken, true);
    const minPnlFactorAfterAdlKey = keys.minPnlFactorAfterAdl(solUsdMarket.marketToken, true);

    await dataStore.setUint(maxPnlFactorKey, decimalToFloat(10, 2)); // 10%
    await dataStore.setUint(maxPnlFactorForAdlKey, decimalToFloat(10, 2)); // 10%
    await dataStore.setUint(minPnlFactorAfterAdlKey, decimalToFloat(2, 2)); // 2%
    await grantRole(roleStore, wallet.address, "ADL_KEEPER");

    // Price hasn't moved -- ADL will not get enabled
    await updateAdlState(fixture, {
      market: solUsdMarket,
      isLong: true,
      tokens: [solUsdMarket.indexToken, wnt.address, usdc.address],
      precisions: [8, 8, 18],
      minPrices: [expandDecimals(20, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
      maxPrices: [expandDecimals(20, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
      tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
    });
    expect(await getIsAdlEnabled(dataStore, solUsdMarket.marketToken, true)).be.false;

    await expect(
      executeAdl(fixture, {
        account: user0.address,
        market: solUsdMarket,
        collateralToken: wnt,
        isLong: true,
        sizeDeltaUsd: decimalToFloat(100 * 1000),
        tokens: [solUsdMarket.indexToken, wnt.address, usdc.address],
        precisions: [8, 8, 18],
        minPrices: [expandDecimals(20, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
        maxPrices: [expandDecimals(20, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
        tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
      })
    ).to.be.revertedWithCustomError(errorsContract, "AdlNotEnabled");

    // Price increases by 10% -- not enough to trigger ADL
    await updateAdlState(fixture, {
      market: solUsdMarket,
      isLong: true,
      tokens: [solUsdMarket.indexToken, wnt.address, usdc.address],
      precisions: [8, 8, 18],
      minPrices: [expandDecimals(22, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
      maxPrices: [expandDecimals(22, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
      tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
    });
    expect(await getIsAdlEnabled(dataStore, solUsdMarket.marketToken, true)).be.false;

    // Price increases by 25%
    // $5 per token for 100,000 tokens puts profit at $500,000 which is 10% of the pool value.
    // Not enough to trigger ADL -- on the border
    await updateAdlState(fixture, {
      market: solUsdMarket,
      isLong: true,
      tokens: [solUsdMarket.indexToken, wnt.address, usdc.address],
      precisions: [8, 8, 18],
      minPrices: [expandDecimals(25, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
      maxPrices: [expandDecimals(25, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
      tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
    });
    expect(await getIsAdlEnabled(dataStore, solUsdMarket.marketToken, true)).be.false;

    expect(await getAccountPositionCount(dataStore, user0.address)).eq(1);
    await updateAdlState(fixture, {
      market: solUsdMarket,
      isLong: true,
      tokens: [solUsdMarket.indexToken, wnt.address, usdc.address],
      precisions: [8, 8, 18],
      minPrices: [expandDecimals(26, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
      maxPrices: [expandDecimals(26, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
      tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
    });
    expect(await getIsAdlEnabled(dataStore, solUsdMarket.marketToken, true)).be.true;

    await executeAdl(fixture, {
      account: user0.address,
      market: solUsdMarket,
      collateralToken: wnt,
      isLong: true,
      sizeDeltaUsd: decimalToFloat(1000 * 1000),
      tokens: [solUsdMarket.indexToken, wnt.address, usdc.address],
      precisions: [8, 8, 18],
      minPrices: [expandDecimals(26, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
      maxPrices: [expandDecimals(26, 4), expandDecimals(5000, 4), expandDecimals(1, 6)],
      tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT],
    });

    // Position is now half the size
    expect(await getAccountPositionCount(dataStore, user0.address)).eq(1);

    const positionKey = getPositionKey(user0.address, solUsdMarket.marketToken, wnt.address, true);
    const position = await reader.getPosition(dataStore.address, positionKey);

    expect(position.numbers.sizeInUsd).to.eq(decimalToFloat(1000 * 1000));
  });
});
