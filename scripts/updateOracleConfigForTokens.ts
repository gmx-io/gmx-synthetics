import { updateOracleConfigForTokens } from "./updateOracleConfigForTokensUtils";

async function main() {
  await updateOracleConfigForTokens({ write: process.env.WRITE });
}

main().catch((ex) => {
  console.error(ex);
  process.exit(1);
});
