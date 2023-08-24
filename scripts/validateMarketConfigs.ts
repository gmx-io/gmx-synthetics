import { validateMarketConfigs } from "./validateMarketConfigsUtils";

async function main() {
  await validateMarketConfigs();
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
