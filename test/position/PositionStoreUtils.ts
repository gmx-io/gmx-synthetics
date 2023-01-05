import { deployContract } from "../../utils/deploy";
import { deployFixture } from "../../utils/fixture";

import { grantRole } from "../../utils/role";
import { validateStoreUtils } from "../../utils/storeUtils";

describe("PositionStoreUtils", () => {
  let fixture;
  let roleStore, positionStoreUtils, positionStoreUtilsTest;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ roleStore, positionStoreUtils } = fixture.contracts);

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
      setItem: positionStoreUtilsTest.setPosition,
    });
  });
});
