import { expect } from "chai";
import { bigNumberify } from "./math";

import { getErrorString } from "./error";

export function expectWithinRange(actualValue, expectedValue, allowedRange) {
  if (actualValue === undefined) {
    throw new Error("actualValue is undefined");
  }
  if (expectedValue === undefined) {
    throw new Error("expectedValue is undefined");
  }

  const lowerBound = bigNumberify(expectedValue).sub(allowedRange);
  const upperBound = bigNumberify(expectedValue).add(allowedRange);

  const label = `expectedValue: ${expectedValue.toString()}`;
  expect(actualValue, label).gt(lowerBound);
  expect(actualValue, label).lt(upperBound);
}

export function expectCancellationReason(cancellationReason: any, expectedCancellationReason: any, label: string) {
  if (cancellationReason) {
    if (expectedCancellationReason) {
      if (typeof expectedCancellationReason === "string") {
        expect(cancellationReason.name).eq(expectedCancellationReason);
      } else {
        expect(expectedCancellationReason.name, "reason name").eq(cancellationReason.name);

        if (expectedCancellationReason.args) {
          expect(expectedCancellationReason.args.length, "reason args length").eq(cancellationReason.args.length);
          expect(expectedCancellationReason.args, "reason args").deep.eq(cancellationReason.args);
        }
      }
    } else {
      throw new Error(`${label} was cancelled: ${getErrorString(cancellationReason)}`);
    }
  } else {
    if (expectedCancellationReason) {
      throw new Error(`${label} was not cancelled, expected cancellation with reason: ${expectedCancellationReason}`);
    }
  }
}
