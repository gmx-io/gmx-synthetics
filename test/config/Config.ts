import { expect } from "chai";
import { deployFixture } from "../../utils/fixture";

import { grantRole } from "../../utils/role";
import { encodeData } from "../../utils/hash";
import { TOKEN_ORACLE_TYPES } from "../../utils/oracle";
import * as keys from "../../utils/keys";

describe("Config", () => {
  let fixture;
  let user0;
  let config, dataStore, roleStore, ethUsdMarket, wnt;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ config, dataStore, roleStore, ethUsdMarket, wnt } = fixture.contracts);
    ({ user0 } = fixture.accounts);

    await grantRole(roleStore, user0.address, "CONFIG_KEEPER");
  });

  it("setBool", async () => {
    const key = keys.isMarketDisabledKey(ethUsdMarket.marketToken);

    expect(await dataStore.getBool(key)).eq(false);

    await config
      .connect(user0)
      .setBool(keys.IS_MARKET_DISABLED, encodeData(["address"], [ethUsdMarket.marketToken]), true);

    expect(await dataStore.getBool(key)).eq(true);
  });

  it("setAddress", async () => {
    const key = keys.isMarketDisabledKey(ethUsdMarket.marketToken);

    expect(await dataStore.getAddress(key)).eq(ethers.constants.AddressZero);

    await config
      .connect(user0)
      .setAddress(keys.IS_MARKET_DISABLED, encodeData(["address"], [ethUsdMarket.marketToken]), wnt.address);

    expect(await dataStore.getAddress(key)).eq(wnt.address);
  });

  it("setBytes32", async () => {
    const key = keys.oracleTypeKey(wnt.address);

    expect(await dataStore.getBytes32(key)).eq(TOKEN_ORACLE_TYPES.DEFAULT);

    await config
      .connect(user0)
      .setBytes32(
        keys.ORACLE_TYPE,
        encodeData(["address"], [wnt.address]),
        "0x0000000000000000000000000000000000000000000000000000000000000123"
      );

    expect(await dataStore.getBytes32(key)).eq("0x0000000000000000000000000000000000000000000000000000000000000123");
  });

  it("setUint", async () => {
    const key = keys.swapImpactFactorKey(ethUsdMarket.marketToken, true);

    expect(await dataStore.getUint(key)).eq(0);

    await config
      .connect(user0)
      .setUint(keys.SWAP_IMPACT_FACTOR, encodeData(["address", "bool"], [ethUsdMarket.marketToken, true]), 700);

    expect(await dataStore.getUint(key)).eq(700);
  });

  it("setInt", async () => {
    const key = keys.swapImpactFactorKey(ethUsdMarket.marketToken, true);

    expect(await dataStore.getInt(key)).eq(0);

    await config
      .connect(user0)
      .setInt(keys.SWAP_IMPACT_FACTOR, encodeData(["address", "bool"], [ethUsdMarket.marketToken, true]), 500);

    expect(await dataStore.getInt(key)).eq(500);
  });
});
