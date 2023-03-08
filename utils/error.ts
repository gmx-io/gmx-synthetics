import { expect } from "chai";
import { parseLogs, getEventDataValue } from "./event";

export function validateCancellationReason({ fixture, txReceipt, eventName, contract, expectedReason }) {
  const logs = parseLogs(fixture, txReceipt);
  const reasonBytes = getEventDataValue(logs, eventName, "reasonBytes");
  const reason = contract.interface.parseError(reasonBytes);
  expect(reason.name).eq(expectedReason);
}
