import * as keys from "../utils/keys";

async function main() {
  const keyName = process.env.KEY_NAME;
  if (keyName) {
    console.log(`keyHash(${keyName}): ${keys[keyName]}`);
  }

  const keyFn = process.env.KEY_FN;
  if (keyFn) {
    const _params = process.env.KEY_PARAMS.split(",");
    const params = [];

    for (let param of _params) {
      if (param === "true") {
        param = true;
      }
      if (param === "false") {
        param = false;
      }
      params.push(param);
    }

    console.log(`keyFn(${keyFn}): ${keys[keyFn](...params)}`);
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
