import { deployContract } from "../../utils/deploy";
import { deployFixture } from "../../utils/fixture";

import { grantRole } from "../../utils/role";
import { validateStoreUtils } from "../../utils/storeUtils";

describe("PositionStoreUtils", () => {
  let fixture;
  let roleStore, reader, positionStoreUtils, positionStoreUtilsTest;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ roleStore, reader, positionStoreUtils } = fixture.contracts);

    positionStoreUtilsTest = await deployContract("PositionStoreUtilsTest", [], {
      libraries: {
        PositionStoreUtils: positionStoreUtils.address,
      },
    });

    await grantRole(roleStore, positionStoreUtilsTest.address, "CONTROLLER");
  });

  it("get, set, remove", async () => {
    await validateStoreUtils({
      fixture,
      getEmptyItem: positionStoreUtilsTest.getEmptyPosition,
      getItem: reader.getPosition,
      setItem: positionStoreUtilsTest.setPosition,
      removeItem: async (dataStore, itemKey, sampleItem) => {
        await positionStoreUtilsTest.removePosition(dataStore.address, itemKey, sampleItem.addresses.account);
      },
      getItemCount: reader.getPositionCount,
      getItemKeys: reader.getPositionKeys,
      getAccountItemCount: reader.getAccountPositionCount,
      getAccountItemKeys: reader.getAccountPositionKeys,
    });
  });
});
