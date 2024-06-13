import { updateMarketConfig } from "./updateMarketConfigUtils";

async function main() {
  updateMarketConfig({ write: true });
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
