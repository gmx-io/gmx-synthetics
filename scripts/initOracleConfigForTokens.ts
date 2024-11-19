import { initOracleConfigForTokens } from "./initOracleConfigForTokensUtils";

async function main() {
  await initOracleConfigForTokens({ write: process.env.WRITE });
}

main().catch((ex) => {
  console.error(ex);
  process.exit(1);
});
