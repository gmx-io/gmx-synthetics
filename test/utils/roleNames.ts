import fs from "fs";
import path from "path";
import { expect } from "chai";
import { utils } from "ethers";
import { hashString } from "../../utils/hash";
import { getRoleName, knownRoles } from "../../utils/roleNames";

describe("Role names", () => {
  it("recognizes every public role constant in Role and Role2", () => {
    const allNames = new Set<string>();
    for (const library of ["Role", "Role2"]) {
      const source = fs.readFileSync(path.join(__dirname, `../../contracts/role/${library}.sol`), "utf8");
      const names = [...source.matchAll(/bytes32\s+public\s+constant\s+(\w+)\s*=/g)].map((match) => match[1]);
      expect(names.length).greaterThan(0);
      for (const name of names) {
        allNames.add(name);
        expect(getRoleName(hashString(name)), `${library}.${name}`).eq(name);
      }
    }
    expect(Object.values(knownRoles).sort()).deep.eq([...allNames, "DONATION_KEEPER"].sort());
  });

  it("includes donation roles and accepts hex case differences", () => {
    expect(getRoleName(hashString("DONATION_KEEPER"))).eq("DONATION_KEEPER");
    expect(getRoleName(hashString("RISK_ORACLE"))).eq("RISK_ORACLE");
    expect(getRoleName(hashString("CONTROLLER").toUpperCase())).eq("CONTROLLER");
  });

  it("uses GMX ABI-encoded string hashes instead of packed UTF-8 hashes", () => {
    const controllerRole = "0x97adf037b2472f4a6a9825eff7d2dd45e37f2dc308df2a260d6a72af4189a65b";
    expect(hashString("CONTROLLER")).eq(controllerRole);
    expect(getRoleName(controllerRole)).eq("CONTROLLER");
    expect(utils.id("CONTROLLER")).not.eq(controllerRole);
    expect(getRoleName(utils.id("CONTROLLER"))).eq(null);
  });

  it("leaves unknown hashes available to callers without inventing a label", () => {
    const unknown = hashString("UNRECOGNIZED_FUTURE_ROLE");
    expect(getRoleName(unknown)).eq(null);
    expect(getRoleName(unknown) ?? unknown).eq(unknown);
  });
});
