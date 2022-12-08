import { mine } from "@nomicfoundation/hardhat-network-helpers";

async function main() {
  await mine();
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
