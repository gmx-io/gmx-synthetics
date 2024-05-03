import * as keys from "./keys";

export function getShiftCount(dataStore) {
  return dataStore.getBytes32Count(keys.SHIFT_LIST);
}

export function getShiftKeys(dataStore, start, end) {
  return dataStore.getBytes32ValuesAt(keys.SHIFT_LIST, start, end);
}

export function getAccountShiftCount(dataStore, account) {
  return dataStore.getBytes32Count(keys.accountShiftListKey(account));
}

export function getAccountShiftKeys(dataStore, account, start, end) {
  return dataStore.getBytes32ValuesAt(keys.accountShiftListKey(account), start, end);
}
