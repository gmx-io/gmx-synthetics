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

  const errorReason = "0xaec5ac84000000000000000000000000000000000000000000000000000000006394d359";
  console.log("Trying to parse error reason", errorReason);

  let parsed = false;
  for (const iface of interfaces) {
    try {
      const parsedError = iface.parseError(errorReason);
      console.log(parsedError);
      parsed = true;
      break;
      // eslint-disable-next-line no-empty
    } catch (ex) {}
  }

  if (!parsed) {
    console.log("Cant parse error reason");
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
