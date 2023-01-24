import * as keys from "./keys";

export function getClaimableFeeAmount(dataStore, market, token) {
  const key = keys.claimableFeeAmountKey(market, token);
  return dataStore.getUint(key);
}
