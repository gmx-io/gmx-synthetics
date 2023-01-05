import { expect } from "chai";
import { hashString } from "./hash";
import { logGasUsage } from "./gas";

export async function validateStoreUtils({
  fixture,
  getEmptyItem,
  getItem,
  setItem,
  removeItem,
  getItemCount,
  getItemKeys,
  getAccountItemCount,
  getAccountItemKeys,
  overrideValues,
}) {
  const { dataStore } = fixture.contracts;
  const { user0, user1 } = fixture.accounts;
  const { accountList } = fixture;
  const emptyStoreItem = await getEmptyItem();
  const itemKey = hashString("key");

  expect(Object.keys(emptyStoreItem).length).eq(6);

  for (let i = 0; i < Object.keys(emptyStoreItem.flags).length / 2; i++) {
    const sampleItem = {
      addresses: {},
      numbers: {},
      flags: {},
    };

    Object.keys(emptyStoreItem.addresses).forEach((key, index) => {
      if (isNaN(key)) {
        let value;

        if (Array.isArray(emptyStoreItem.addresses[key])) {
          value = [accountList[index].address];
        } else if (key === "account") {
          value = user0.address;
        } else {
          value = accountList[index].address;
        }

        if (overrideValues[`addresses.${key}`]) {
          value = overrideValues[`addresses.${key}`];
        }

        sampleItem.addresses[key] = value;
      }
    });

    Object.keys(emptyStoreItem.numbers).forEach((key, index) => {
      if (isNaN(key)) {
        let value = index + 1;

        if (overrideValues[`numbers.${key}`]) {
          value = overrideValues[`numbers.${key}`];
        }

        sampleItem.numbers[key] = value;
      }
    });

    Object.keys(emptyStoreItem.flags).forEach((key, index) => {
      if (isNaN(key)) {
        const adjustedIndex = index - Object.keys(emptyStoreItem.flags).length / 2;
        // only set one flag to true at a time
        sampleItem.flags[key] = adjustedIndex === i;
      }
    });

    expect(await getItemCount(dataStore)).eq(0);
    expect(await getItemKeys(dataStore, 0, 10)).deep.equal([]);

    expect(await getAccountItemCount(dataStore, user0.address)).eq(0);
    expect(await getAccountItemKeys(dataStore, user0.address, 0, 10)).deep.equal([]);

    expect(await getAccountItemCount(dataStore, user1.address)).eq(0);
    expect(await getAccountItemKeys(dataStore, user1.address, 0, 10)).deep.equal([]);

    await logGasUsage({
      tx: setItem(dataStore, itemKey, sampleItem),
      label: "setItem",
    });

    return;
    expect(await getItemCount(dataStore)).eq(1);
    expect(await getItemKeys(dataStore, 0, 10)).deep.equal([itemKey]);

    expect(await getAccountItemCount(dataStore, user0.address)).eq(1);
    expect(await getAccountItemKeys(dataStore, user0.address, 0, 10)).deep.equal([itemKey]);

    expect(await getAccountItemCount(dataStore, user1.address)).eq(0);
    expect(await getAccountItemKeys(dataStore, user1.address, 0, 10)).deep.equal([]);

    let fetchedItem = await getItem(dataStore, itemKey);

    Object.keys(emptyStoreItem.addresses).forEach((key) => {
      if (isNaN(key)) {
        expect(fetchedItem.addresses[key]).deep.eq(sampleItem.addresses[key]);
      }
    });

    Object.keys(emptyStoreItem.numbers).forEach((key) => {
      if (isNaN(key)) {
        expect(fetchedItem.numbers[key]).eq(sampleItem.numbers[key]);
      }
    });

    Object.keys(emptyStoreItem.flags).forEach((key) => {
      if (isNaN(key)) {
        expect(fetchedItem.flags[key]).eq(sampleItem.flags[key]);
      }
    });

    await removeItem(dataStore, itemKey, sampleItem);

    expect(await getItemCount(dataStore)).eq(0);
    expect(await getItemKeys(dataStore, 0, 10)).deep.equal([]);

    expect(await getAccountItemCount(dataStore, user0.address)).eq(0);
    expect(await getAccountItemKeys(dataStore, user0.address, 0, 10)).deep.equal([]);

    expect(await getAccountItemCount(dataStore, user1.address)).eq(0);
    expect(await getAccountItemKeys(dataStore, user1.address, 0, 10)).deep.equal([]);

    fetchedItem = await getItem(dataStore, itemKey);

    Object.keys(emptyStoreItem.addresses).forEach((key) => {
      if (isNaN(key)) {
        if (Array.isArray(emptyStoreItem.addresses[key])) {
          expect(fetchedItem.addresses[key]).deep.eq([]);
        } else {
          expect(fetchedItem.addresses[key]).eq(ethers.constants.AddressZero);
        }
      }
    });

    Object.keys(emptyStoreItem.numbers).forEach((key) => {
      if (isNaN(key)) {
        expect(fetchedItem.numbers[key]).eq(0);
      }
    });

    Object.keys(emptyStoreItem.flags).forEach((key) => {
      if (isNaN(key)) {
        expect(fetchedItem.flags[key]).eq(false);
      }
    });
  }
}
