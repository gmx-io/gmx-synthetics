import { updateMarketConfig } from "./updateMarketConfigUtils";
import { MarketState } from "../config/markets";

function getMarketState(): MarketState | undefined {
  const value = process.env.MARKET_STATE;

  if (!value) {
    return undefined;
  }

  if (Object.values(MarketState).includes(value as MarketState)) {
    return value as MarketState;
  }

  throw new Error(`Invalid MARKET_STATE: "${value}". Expected "${MarketState.Open}" or "${MarketState.Closed}".`);
}

async function main() {
  await updateMarketConfig({
    write: process.env.WRITE === "true",
    includeRiskOracleBaseKeys: process.env.INCLUDE_RISK_ORACLE_BASE_KEYS === "true",
    includeKeeperBaseKeys: process.env.INCLUDE_KEEPER_BASE_KEYS === "true",
    includeMaxOpenInterest: process.env.INCLUDE_MAX_OPEN_INTEREST === "true",
    includePositionImpact: process.env.INCLUDE_POSITION_IMPACT === "true",
    includeFunding: process.env.INCLUDE_FUNDING === "true",
    market: process.env.MARKET,
    marketState: getMarketState(),
  });
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
