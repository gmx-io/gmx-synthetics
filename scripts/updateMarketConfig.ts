import { updateMarketConfig } from "./updateMarketConfigUtils";
import { MarketHours } from "../config/markets";

function getMarketHours(): MarketHours | undefined {
  const value = process.env.MARKET_STATE;

  if (!value) {
    return undefined;
  }

  if (Object.values(MarketHours).includes(value as MarketHours)) {
    return value as MarketHours;
  }

  throw new Error(`Invalid MARKET_STATE: "${value}". Expected "${MarketHours.Regular}" or "${MarketHours.Closed}".`);
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
    marketHours: getMarketHours(),
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
