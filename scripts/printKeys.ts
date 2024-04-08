import * as keys from "../utils/keys";

async function main() {
  for (const [name, value] of Object.entries(keys)) {
    if (typeof value !== "function") {
      console.log(name, value);
    }
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
