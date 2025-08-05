import { validateTickers } from "./validateTickersUtils";

async function main() {
  await validateTickers();
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
