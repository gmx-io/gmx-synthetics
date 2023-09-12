import { expect } from "chai";
import { deployContract } from "../../utils/deploy";

describe("Calc", () => {
  let calcTest;

  beforeEach(async () => {
    calcTest = await deployContract("CalcTest", []);
  });

  it("boundMagnitude", async () => {
    for (const [values, expected] of [
      [[5, 2, 7], 5],
      [[10, 2, 7], 7],
      [[1, 2, 7], 2],
      [[-5, 2, 7], -5],
      [[-10, 2, 7], -7],
      [[-1, 2, 7], -2],
      [[0, 2, 7], 2],
      [[1, 7, 2], 2],
      [[10, 7, 2], 2],
    ]) {
      const result = await calcTest.boundMagnitude(...values);
      expect(result).to.equal(expected);
    }
  });
});
