const { expect } = require("chai");

const { deployContract } = require("../../utils/deploy");

describe("Array", () => {
  let arrayTest;

  beforeEach(async () => {
    arrayTest = await deployContract("ArrayTest", []);
  });

  // it("getMedian", async () => {
  //   for (const [arr, expected] of [
  //     [[1, 2, 3], 2],
  //     [[1, 2, 3, 4], 2],
  //     [[11, 12, 14, 15], 13],
  //     [[1, 12, 14, 10000], 13],
  //     [[1000000, 1000050, 1000100, 2000000], 1000075],
  //   ]) {
  //     const median = await ArrayTest.getMedian(arr);
  //     expect(median).to.equal(expected);
  //   }
  // });

  it("sort", async () => {
    for (const [arr, expected] of [
      [
        [5, 8, 2, 12],
        [2, 5, 8, 12],
      ],
      [
        [21, 7, 1, 18, 12],
        [1, 7, 12, 18, 21],
      ],
      [
        [21, 7, 1, 18, 12, 100, 29, 38],
        [1, 7, 12, 18, 21, 29, 38, 100],
      ],
    ]) {
      await arrayTest.sortGasUsage(arr);
      const median = await arrayTest.sort(arr);
      expect(median.map((item) => item.toString())).to.eql(expected.map((item) => item.toString()));
    }
  });
});
