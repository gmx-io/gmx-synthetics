import fs from "fs";

import hre from "hardhat";
import glob from "glob";

const { ethers } = hre;

async function main() {
  const files = glob.sync(`./deployments/${hre.network.name}/*.json`);

  const interfaces = files.map((file) => {
    const abi = JSON.parse(fs.readFileSync(file).toString()).abi;
    return new ethers.utils.Interface(abi);
  });

  const errorReason = "554e41434345505441424c455f50524943455f4552524f520000000000000000";
  console.log("Trying to parse error reason", errorReason);

  let parsed = false;
  for (const iface of interfaces) {
    try {
      const parsedError = iface.parseError(errorReason);
      console.log(parsedError);

      console.log(
        "%s(%s)",
        parsedError.name,
        Object.keys(parsedError.args)
          .reduce((memo, key) => {
            if (!isNaN(Number(key))) {
              return memo;
            }
            memo.push(`${key}=${parsedError.args[key].toString()}`);
            return memo;
          }, [])
          .join(", ")
      );
      parsed = true;
      break;
      // eslint-disable-next-line no-empty
    } catch (ex) {
      if (!ex.toString().includes("no matching error")) {
        console.error(ex);
      }
    }
  }

  if (!parsed) {
    console.log("Cant parse custom error reason");
  }

  try {
    console.log("try parse as string");
    console.log("parsed string %s", ethers.utils.parseBytes32String("0x" + errorReason));
  } catch (ex) {
    console.log("can't parse as string", ex.toString());
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
