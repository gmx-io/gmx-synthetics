import { validateMarketConfigs } from "./validateMarketConfigsUtils";

async function main() {
  // some validation errors are returned instead of thrown; exit non-zero so a monitor or CI can detect them.
  const { errors } = await validateMarketConfigs();
  if (errors.length > 0) {
    console.error(`Found ${errors.length} market config error(s)`);
    process.exit(1);
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
