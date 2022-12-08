import { hashString } from "./hash";

export async function grantRole(roleStore, account, role) {
  await roleStore.grantRole(account, hashString(role));
}
