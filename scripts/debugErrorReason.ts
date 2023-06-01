import fs from "fs";

import hre from "hardhat";
import glob from "glob";

const { ethers } = hre;

// let errorReason =
// "0x5dac504d000000000000000000000000000000000000000000000000001550f7df836c0000000000000000000000000000000000000000000000000000038d7ea4c68000";
let errorReason =
  "0x8af0d140ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0000000000000000000000000000000000000000000000000000000000000000";
// let errorReason =
// "0x08c379a0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000094241445f4552524f520000000000000000000000000000000000000000000000";

const PANIC_MAP = {
  0x00: "generic compiler inserted panics",
  0x01: "call assert with an argument that evaluates to false",
  0x11: "arithmetic operation results in underflow or overflow outside of an unchecked { ... } block.",
  0x12: "divide or modulo operation by zero (e.g. 5 / 0 or 23 % 0)",
  0x21: "convert a value that is too big or negative into an enum type",
  0x22: "access a storage byte array that is incorrectly encoded",
  0x31: "call .pop() on an empty array.",
  0x32: "access an array, bytesN or an array slice at an out-of-bounds or negative index",
  0x41: "allocate too much memory or create an array that is too large",
  0x51: "call a zero-initialized variable of internal function type.",
};

async function main() {
  const files = glob.sync(`./deployments/${hre.network.name}/*.json`);

  errorReason = errorReason.toLocaleLowerCase();
  if (!errorReason.startsWith("0x")) {
    errorReason = "0x" + errorReason;
  }

  const interfaces = files.map((file) => {
    const abi = JSON.parse(fs.readFileSync(file).toString()).abi;
    return new ethers.utils.Interface(abi);
  });

  console.log("trying to parse custom error reason", errorReason);

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
  if (parsed) {
    return;
  }

  const panicSignature = ethers.utils.id("Panic(uint256)").slice(0, 10);
  console.log("trying to parse Panic(uint256), signature: %s", panicSignature);
  if (errorReason.startsWith(panicSignature)) {
    const [panicCode] = ethers.utils.defaultAbiCoder.decode(
      ["uint256"],
      "0x" + errorReason.slice(panicSignature.length)
    );
    console.log("Parsed: Panic(%s): %s", panicCode.toString(), PANIC_MAP[panicCode.toString()]);
    return;
  }

  const errorSignature = ethers.utils.id("Error(string)").slice(0, 10);
  console.log("trying to parse Error(string), signature:", errorSignature);
  if (errorReason.startsWith(errorSignature)) {
    const [errorString] = ethers.utils.defaultAbiCoder.decode(
      ["string"],
      "0x" + errorReason.slice(errorSignature.length)
    );
    console.log('Parsed: Error("%s")', errorString);
    return;
  }

  try {
    console.log("trying to parse as string");
    console.log("parsed string %s", ethers.utils.parseBytes32String(errorReason));
    // eslint-disable-next-line no-empty
  } catch (ex) {}

  console.warn("unable to parse error reason");
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
