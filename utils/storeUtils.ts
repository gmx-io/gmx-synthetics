import { expect } from "chai";
import { hashString } from "./hash";

export async function validateStoreUtils({ fixture, getEmptyItem, getItem, setItem, removeItem }) {
  const { dataStore } = fixture.contracts;
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
        sampleItem.addresses[key] = accountList[index].address;
      }
    });

    Object.keys(emptyStoreItem.numbers).forEach((key, index) => {
      if (isNaN(key)) {
        sampleItem.numbers[key] = index + 1;
      }
    });

    Object.keys(emptyStoreItem.flags).forEach((key, index) => {
      if (isNaN(key)) {
        const adjustedIndex = index - Object.keys(emptyStoreItem.flags).length / 2;
        // only set one flag to true at a time
        sampleItem.flags[key] = adjustedIndex === i;
      }
    });

    await setItem(dataStore.address, itemKey, sampleItem);
    let fetchedItem = await getItem(dataStore.address, itemKey);

    Object.keys(emptyStoreItem.addresses).forEach((key) => {
      if (isNaN(key)) {
        expect(fetchedItem.addresses[key]).eq(sampleItem.addresses[key]);
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
    fetchedItem = await getItem(dataStore.address, itemKey);

    Object.keys(emptyStoreItem.addresses).forEach((key) => {
      if (isNaN(key)) {
        expect(fetchedItem.addresses[key]).eq(ethers.constants.AddressZero);
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
