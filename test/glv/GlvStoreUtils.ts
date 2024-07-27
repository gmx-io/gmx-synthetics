import { expect } from "chai";
import { ethers } from "hardhat";
import { deployContract } from "../../utils/deploy";
import { deployFixture } from "../../utils/fixture";

import { grantRole } from "../../utils/role";
import { getGlvCount, getGlvKeys, DEFAULT_GLV_TYPE } from "../../utils/glv";
import { logGasUsage } from "../../utils/gas";

describe("GlvStoreUtils", () => {
  let fixture;
  let accountList;
  let dataStore, roleStore, glvReader, glvStoreUtils, glvStoreUtilsTest;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ accountList } = fixture);
    ({ dataStore, roleStore, glvReader, glvStoreUtils } = fixture.contracts);

    glvStoreUtilsTest = await deployContract("GlvStoreUtilsTest", [], {
      libraries: {
        GlvStoreUtils: glvStoreUtils.address,
      },
    });

    await grantRole(roleStore, glvStoreUtilsTest.address, "CONTROLLER");
  });

  it("get, set, remove", async () => {
    const sampleItem = {};
    const itemKey = accountList[accountList.length - 1].address;
    const glvType = DEFAULT_GLV_TYPE;

    const getEmptyItem = glvStoreUtilsTest.getEmptyGlv;
    const getItem = async (dataStore, key) => {
      return await glvReader.getGlv(dataStore.address, key);
    };
    const getItemCount = getGlvCount;
    const getItemKeys = getGlvKeys;
    const setItem = async (dataStore, key, sampleItem) => {
      return await glvStoreUtilsTest.setGlv(dataStore.address, key, glvType, sampleItem);
    };
    const removeItem = async (dataStore, itemKey) => {
      return await glvStoreUtilsTest.removeGlv(dataStore.address, itemKey);
    };

    const emptyStoreItem = await getEmptyItem();

    const expectedPropsLength = 3;
    expect(Object.keys(emptyStoreItem).length).eq(expectedPropsLength * 2);

    Object.keys(emptyStoreItem).forEach((key, index) => {
      if (isNaN(parseInt(key))) {
        sampleItem[key] = accountList[index].address;
      }
    });

    const initialItemCount = await getItemCount(dataStore);
    const initialItemKeys = await getItemKeys(dataStore, 0, 10);

    await logGasUsage({
      tx: setItem(dataStore, itemKey, sampleItem),
      label: "setItem",
    });

    let fetchedItem = await getItem(dataStore, itemKey);

    Object.keys(emptyStoreItem).forEach((key) => {
      if (isNaN(parseInt(key))) {
        expect(fetchedItem[key]).deep.eq(sampleItem[key]);
      }
    });

    expect(await getItemCount(dataStore)).eq(initialItemCount.add(1));
    expect(await getItemKeys(dataStore, 0, 10)).deep.equal(initialItemKeys.concat(itemKey));

    await removeItem(dataStore, itemKey);

    fetchedItem = await getItem(dataStore, itemKey);

    Object.keys(emptyStoreItem).forEach((key) => {
      if (isNaN(parseInt(key))) {
        expect(fetchedItem[key]).deep.eq(ethers.constants.AddressZero);
      }
    });

    expect(await getItemCount(dataStore)).eq(initialItemCount);
    expect(await getItemKeys(dataStore, 0, 10)).deep.equal(initialItemKeys);
  });
});
