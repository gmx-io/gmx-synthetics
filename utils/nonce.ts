import { hashData } from "./hash";
import * as keys from "./keys";

export async function getNextKey(dataStore) {
  const nonce = await dataStore.getUint(keys.NONCE);
  const nextNonce = nonce.add(1);

  return hashData(["address", "uint256"], [dataStore.address, nextNonce]);
}
