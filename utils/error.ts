import { getEventDataValue } from "./event";
import { ethers } from "hardhat";

import Errors from "../artifacts/contracts/error/Errors.sol/Errors.json";

export const errorsInterface = new ethers.utils.Interface(Errors.abi);
export const errorsContract = new ethers.Contract(ethers.constants.AddressZero, Errors.abi);

export function getErrorString(error: { name: string; args: any[] }) {
  return JSON.stringify({
    name: error.name,
    args: error.args.map((value) => value.toString()),
  });
}

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
export const PANIC_SIGNATURE4 = ethers.utils.id("Panic(uint256)").slice(0, 10);

export function parseError(reasonBytes, shouldThrow = true) {
  if (reasonBytes.startsWith(PANIC_SIGNATURE4)) {
    const [panicCode] = ethers.utils.defaultAbiCoder.decode(["uint256"], "0x" + reasonBytes.slice(10));
    return {
      name: "Panic",
      args: [panicCode.toString(), PANIC_MAP[panicCode.toString()]],
    } as any;
  }

  try {
    const reason = errorsInterface.parseError(reasonBytes);
    return reason;
  } catch (e) {
    if (!shouldThrow) {
      return;
    }
    throw new Error(`Could not parse errorBytes ${reasonBytes}`);
  }
}

export function getCancellationReason({ logs, eventName }) {
  const reason = getEventDataValue(logs, eventName, "reason");
  if (reason === "AUTO_CANCEL") {
    return;
  }

  const reasonBytes = getEventDataValue(logs, eventName, "reasonBytes");
  if (!reasonBytes) {
    return;
  }

  return parseError(reasonBytes);
}
