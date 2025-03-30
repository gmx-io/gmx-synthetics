import * as keys from "../utils/keys";

async function main() {
  console.log("ATOMIC_SWAP_FEE_TYPE", keys.ATOMIC_SWAP_FEE_TYPE);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
