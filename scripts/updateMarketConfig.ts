import { updateMarketConfig } from "./updateMarketConfigUtils";

async function main() {
  await updateMarketConfig({
    write: process.env.WRITE,
    includeRiskOracleBaseKeys: process.env.INCLUDE_RISK_ORACLE_BASE_KEYS === "true",
    market: process.env.MARKET,
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
