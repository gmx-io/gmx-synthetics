import { getEventDataValue } from "./event";

import Errors from "../artifacts/contracts/errors/Errors.sol/Errors.json";

export function getErrorString(error) {
  return JSON.stringify({
    name: error.name,
    args: error.args.map((value) => value.toString()),
  });
}

export function getCancellationReason({ logs, eventName }) {
  const reasonBytes = getEventDataValue(logs, eventName, "reasonBytes");
  if (!reasonBytes) {
    return;
  }

  const errors = new ethers.utils.Interface(Errors.abi);
  try {
    const reason = errors.parseError(reasonBytes);
    return reason;
  } catch (e) {
    throw new Error(`Could not parse errorBytes ${reasonBytes}`);
  }
}
