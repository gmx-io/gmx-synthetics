import { getEventDataValue } from "./event";

import Errors from "../artifacts/contracts/error/Errors.sol/Errors.json";

export const errorsInterface = new ethers.utils.Interface(Errors.abi);
export const errorsContract = new ethers.Contract(ethers.constants.AddressZero, Errors.abi);

export function getErrorString(error) {
  return JSON.stringify({
    name: error.name,
    args: error.args.map((value) => value.toString()),
  });
}

export function parseError(reasonBytes, shouldThrow = true) {
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
