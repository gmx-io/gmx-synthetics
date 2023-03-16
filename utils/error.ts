import { getEventDataValue } from "./event";

export function getErrorString(error) {
  return JSON.stringify({
    name: error.name,
    args: error.args.map((value) => value.toString()),
  });
}

export function getCancellationReason({ logs, eventName, contracts }) {
  const reasonBytes = getEventDataValue(logs, eventName, "reasonBytes");
  if (!reasonBytes) {
    return;
  }

  return parseError(reasonBytes, contracts);
}

function parseError(errorBytes, contracts) {
  for (let i = 0; i < contracts.length; i++) {
    try {
      const reason = contracts[i].interface.parseError(errorBytes);
      return reason;
    } catch (e) {
      // ignore error
    }
  }

  throw new Error(`Could not parse errorBytes ${errorBytes}`);
}
