import * as keys from "./keys";

export function getPositionCount(dataStore) {
  return dataStore.getBytes32Count(keys.POSITION_LIST);
}

export function getPositionKeys(dataStore, start, end) {
  return dataStore.getBytes32ValuesAt(keys.POSITION_LIST, start, end);
}

export function getAccountPositionCount(dataStore, account) {
  return dataStore.getBytes32Count(keys.accountPositionListKey(account));
}

export function getAccountPositionKeys(dataStore, account, start, end) {
  return dataStore.getBytes32ValuesAt(keys.accountPositionListKey(account), start, end);
}
