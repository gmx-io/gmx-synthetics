import hre from "hardhat";

import { parseError, getErrorString } from "../utils/error";

const { ethers } = hre;

let errorBytes = process.env.ERROR;

// let errorBytes =
// "0x5dac504d000000000000000000000000000000000000000000000000001550f7df836c0000000000000000000000000000000000000000000000000000038d7ea4c68000";
// let errorBytes = "0x4e487b710000000000000000000000000000000000000000000000000000000000000011";
// let errorBytes =
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
  errorBytes = errorBytes.toLocaleLowerCase();
  if (!errorBytes.startsWith("0x")) {
    errorBytes = "0x" + errorBytes;
  }

  console.log("trying to parse custom error reason", errorBytes);

  try {
    const errorReason = parseError(errorBytes);
    console.log("parsed:", getErrorString(errorReason));
    return;
  } catch (e) {
    // eslint-disable-next: no-empty
  }

  const panicSignature = ethers.utils.id("Panic(uint256)").slice(0, 10);
  console.log("trying to parse Panic(uint256), signature: %s", panicSignature);
  if (errorBytes.startsWith(panicSignature)) {
    const [panicCode] = ethers.utils.defaultAbiCoder.decode(
      ["uint256"],
      "0x" + errorBytes.slice(panicSignature.length)
    );
    console.log("parsed: Panic(%s): %s", panicCode.toString(), PANIC_MAP[panicCode.toString()]);
    return;
  }

  const errorSignature = ethers.utils.id("Error(string)").slice(0, 10);
  console.log("trying to parse Error(string), signature:", errorSignature);
  if (errorBytes.startsWith(errorSignature)) {
    const [errorString] = ethers.utils.defaultAbiCoder.decode(
      ["string"],
      "0x" + errorBytes.slice(errorSignature.length)
    );
    console.log('parsed: Error("%s")', errorString);
    return;
  }

  try {
    console.log("trying to parse as string");
    console.log("parsed string %s", ethers.utils.parseBytes32String(errorBytes));
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
