import { updateGlvConfig } from "./updateGlvConfigUtils";

async function main() {
  await updateGlvConfig({ write: process.env.WRITE });
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
