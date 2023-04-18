import { expect } from "chai";
import { bigNumberify } from "./math";

export function expectWithinRange(actualValue, expectedValue, allowedRange) {
  const lowerBound = bigNumberify(expectedValue).sub(allowedRange);
  const upperBound = bigNumberify(expectedValue).add(allowedRange);

  expect(actualValue).gt(lowerBound);
  expect(actualValue).lt(upperBound);
}
