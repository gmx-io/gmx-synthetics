import { updateRiskOracleConfig } from "./updateRiskOracleConfigUtils";

async function main() {
  await updateRiskOracleConfig({ write: process.env.WRITE });
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });