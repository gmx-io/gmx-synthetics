import { expect } from "chai";
import { getParsedLog, getEventLogValue } from "./event";

export function validateCancellationReason({ fixture, txReceipt, eventName, contract, expectedReason }) {
  const logInfo = getParsedLog(fixture, txReceipt, eventName);
  const reasonBytes = getEventLogValue(logInfo, "reasonBytes");
  const reason = contract.interface.parseError(reasonBytes);
  expect(reason.name).eq(expectedReason);
}
