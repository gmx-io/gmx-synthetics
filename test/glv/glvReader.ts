import { expect } from "chai";
import { deployFixture } from "../../utils/fixture";

describe("Glv Deposits", () => {
  let fixture;
  let glvReader, dataStore, ethUsdMarket, solUsdMarket, ethUsdGlvAddress;

  beforeEach(async () => {
    fixture = await deployFixture();

    ({ glvReader, dataStore, ethUsdMarket, solUsdMarket, ethUsdGlvAddress } = fixture.contracts);
  });

  it("getGlvInfo", async () => {
    const glvInfo = await glvReader.getGlvInfo(dataStore.address, ethUsdGlvAddress);

    expect(glvInfo.markets.length).eq(2);
    expect(glvInfo.markets).deep.eq([ethUsdMarket.marketToken, solUsdMarket.marketToken]);
  });

  it("getGlvInfoList", async () => {
    const glvInfoList = await glvReader.getGlvInfoList(dataStore.address, 0, 100);

    expect(glvInfoList.length).eq(1);
    expect(glvInfoList[0].markets.length).eq(2);
    expect(glvInfoList[0].markets).deep.eq([ethUsdMarket.marketToken, solUsdMarket.marketToken]);
  });
});
