import { updateGeneralConfig } from "./updateGeneralConfigUtils";

async function main() {
  await updateGeneralConfig({ write: process.env.WRITE });
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
