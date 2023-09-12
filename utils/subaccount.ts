import * as keys from "./keys";

export function getSubaccountsCount(dataStore, account) {
  return dataStore.getAddressCount(keys.subaccountListKey(account));
}

export function getSubaccounts(dataStore, account, start, end) {
  return dataStore.getAddressValuesAt(keys.subaccountListKey(account), start, end);
}
