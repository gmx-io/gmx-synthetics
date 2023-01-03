import { expect } from "chai";

import { deployContract } from "../../utils/deploy";
import { deployFixture } from "../../utils/fixture";

import { hashString } from "../../utils/hash";
import { grantRole } from "../../utils/role";

describe("PositionStoreUtils", () => {
  let roleStore, dataStore, positionStoreUtils, positionReader, positionStoreUtilsTest;
  let accountList;

  beforeEach(async () => {
    const fixture = await deployFixture();
    ({ roleStore, dataStore, positionStoreUtils } = fixture.contracts);
    ({ accountList } = fixture);

    positionStoreUtilsTest = await deployContract("PositionStoreUtilsTest", [], {
      libraries: {
        PositionStoreUtils: positionStoreUtils.address,
      },
    });

    console.log("grantRole");
    await grantRole(roleStore, positionStoreUtilsTest.address, "CONTROLLER");
  });

  it("get, set, remove", async () => {
    const emptyPosition = await positionStoreUtilsTest.getEmptyPosition();
    const positionKey = hashString("key");

    for (let i = 0; i < Object.keys(emptyPosition.flags).length / 2; i++) {
      const samplePosition = {
        addresses: {},
        numbers: {},
        flags: {},
      };

      Object.keys(emptyPosition.addresses).forEach((key, index) => {
        if (isNaN(key)) {
          samplePosition.addresses[key] = accountList[index].address;
        }
      });

      Object.keys(emptyPosition.numbers).forEach((key, index) => {
        if (isNaN(key)) {
          samplePosition.numbers[key] = index;
        }
      });

      Object.keys(emptyPosition.flags).forEach((key, index) => {
        if (isNaN(key)) {
          const adjustedIndex = index - Object.keys(emptyPosition.flags).length / 2;
          // only set one flag to true at a time
          samplePosition.flags[key] = adjustedIndex === i;
        }
      });

      await positionStoreUtilsTest.set(dataStore.address, positionKey, samplePosition);
    }
  });
});
