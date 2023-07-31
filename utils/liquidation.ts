import { bigNumberify, expandDecimals } from "./math";
import { executeWithOracleParams } from "./exchange";
import { TOKEN_ORACLE_TYPES } from "./oracle";
import { parseLogs } from "./event";

export async function executeLiquidation(fixture, overrides) {
  const { wnt, usdc } = fixture.contracts;
  const { account, market, collateralToken, isLong, gasUsageLabel } = overrides;
  const { liquidationHandler } = fixture.contracts;
  const tokens = overrides.tokens || [wnt.address, usdc.address];
  const tokenOracleTypes = overrides.tokenOracleTypes || [TOKEN_ORACLE_TYPES.DEFAULT, TOKEN_ORACLE_TYPES.DEFAULT];
  const precisions = overrides.precisions || [8, 18];
  const minPrices = overrides.minPrices || [expandDecimals(5000, 4), expandDecimals(1, 6)];
  const maxPrices = overrides.maxPrices || [expandDecimals(5000, 4), expandDecimals(1, 6)];

  const block = await ethers.provider.getBlock();

  const params = {
    oracleBlockNumber: bigNumberify(block.number),
    tokens,
    tokenOracleTypes,
    precisions,
    minPrices,
    maxPrices,
    execute: async (key, oracleParams) => {
      return await liquidationHandler.executeLiquidation(
        account,
        market.marketToken,
        collateralToken.address,
        isLong,
        oracleParams
      );
    },
    gasUsageLabel,
  };

  const txReceipt = await executeWithOracleParams(fixture, params);
  const logs = parseLogs(fixture, txReceipt);

  const result = { txReceipt, logs };

  if (overrides.afterExecution) {
    await overrides.afterExecution(result);
  }

  return result;
}
