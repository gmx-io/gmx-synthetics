import Role from "../artifacts/contracts/role/Role.sol/Role.json";
import Role2 from "../artifacts/contracts/role/Role2.sol/Role2.json";
import { hashString } from "./hash";

// Public role constants expose zero-argument bytes32 getters in the library ABIs.
const roleNames = [...Role.abi, ...Role2.abi]
  .filter(
    (entry) =>
      entry.type === "function" &&
      entry.inputs.length === 0 &&
      entry.outputs.length === 1 &&
      entry.outputs[0].type === "bytes32" &&
      /^[A-Z][A-Z0-9_]*$/.test(entry.name)
  )
  .map((entry) => entry.name);

// DONATION_KEEPER is also used by deployed contracts, outside these role libraries.
export const knownRoles: Record<string, string> = Object.fromEntries(
  [...new Set([...roleNames, "DONATION_KEEPER"])].map((role) => [hashString(role), role])
);

export function getRoleName(roleHash: string): string | null {
  const role = knownRoles[roleHash.toLowerCase()];
  return typeof role === "string" ? role : null;
}
