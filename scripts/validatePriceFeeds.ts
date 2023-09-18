import { validatePriceFeeds } from "./validatePriceFeedsUtils";

async function main() {
  await validatePriceFeeds();
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
