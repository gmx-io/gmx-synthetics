import { hashString, hashData } from "./hash";

export const POSITION_KEYS = hashString("POSITION_KEYS");
export const ACCOUNT_POSITION_KEYS = hashString("ACCOUNT_POSITION_KEYS");

function getAccountPositionListKey(account) {
  return hashData(["bytes32", "address"], [ACCOUNT_POSITION_KEYS, account]);
}

export function getPositionCount(dataStore) {
  return dataStore.getBytes32Count(POSITION_KEYS);
}

export function getPositionKeys(dataStore, start, end) {
  return dataStore.getBytes32ValuesAt(POSITION_KEYS, start, end);
}

export function getAccountPositionCount(dataStore, account) {
  return dataStore.getBytes32Count(getAccountPositionListKey(account));
}

export function getAccountPositionKeys(dataStore, account, start, end) {
  return dataStore.getBytes32ValuesAt(getAccountPositionListKey(account), start, end);
}
