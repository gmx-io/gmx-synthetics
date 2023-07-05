import { expect } from "chai";
import { bigNumberify } from "./math";

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
