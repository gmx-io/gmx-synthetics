import { updateMarketConfig } from "./updateMarketConfigUtils";

async function main() {
  await updateMarketConfig({ write: process.env.WRITE });
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
