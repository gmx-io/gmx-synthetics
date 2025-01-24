import { deployContract } from "../../utils/deploy";
import { deployFixture } from "../../utils/fixture";

import { grantRole } from "../../utils/role";
import { validateStoreUtils } from "../../utils/storeUtils";
import { getGlvShiftCount, getGlvShiftKeys } from "../../utils/glv/glvShift";

describe("GlvShiftStoreUtils", () => {
  let fixture;
  let roleStore, glvReader, glvShiftStoreUtils, glvShiftStoreUtilsTest;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ roleStore, glvReader, glvShiftStoreUtils } = fixture.contracts);

    glvShiftStoreUtilsTest = await deployContract("GlvShiftStoreUtilsTest", [], {
      libraries: {
        GlvShiftStoreUtils: glvShiftStoreUtils.address,
      },
    });

    await grantRole(roleStore, glvShiftStoreUtilsTest.address, "CONTROLLER");
  });

  it("get, set, remove", async () => {
    await validateStoreUtils({
      fixture,
      getEmptyItem: glvShiftStoreUtilsTest.getEmptyGlvShift,
      getItem: async (dataStore, key) => {
        return await glvReader.getGlvShift(dataStore.address, key);
      },
      setItem: async (dataStore, key, sampleItem) => {
        return await glvShiftStoreUtilsTest.setGlvShift(dataStore.address, key, sampleItem);
      },
      removeItem: async (dataStore, itemKey) => {
        return await glvShiftStoreUtilsTest.removeGlvShift(dataStore.address, itemKey);
      },
      getItemCount: getGlvShiftCount,
      getItemKeys: getGlvShiftKeys,
      expectedPropsLength: 2,
    });
  });
});
