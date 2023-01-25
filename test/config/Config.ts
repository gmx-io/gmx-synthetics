import { expect } from "chai";
import { deployFixture } from "../../utils/fixture";

import { grantRole } from "../../utils/role";
import { addressToBytes32 } from "../../utils/hash";
import * as keys from "../../utils/keys";

describe("Config", () => {
  let fixture;
  let user0;
  let config, dataStore, roleStore, ethUsdMarket;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ config, dataStore, roleStore, ethUsdMarket } = fixture.contracts);
    ({ user0 } = fixture.accounts);

    await grantRole(roleStore, user0.address, "CONFIG_KEEPER");
  });

  it("setBool", async () => {
    const key = keys.isMarketDisabledKey(ethUsdMarket.marketToken);

    expect(await dataStore.getBool(key)).eq(false);

    await config.connect(user0).setBool(keys.IS_MARKET_DISABLED, addressToBytes32(ethUsdMarket.marketToken), true);

    expect(await dataStore.getBool(key)).eq(true);
  });
});
