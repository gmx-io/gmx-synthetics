import { expect } from "chai";

import { expandDecimals } from "../../utils/math";
import { hashString } from "../../utils/hash";
import { deployFixture } from "../../utils/fixture";
import { TOKEN_ORACLE_TYPES, getOracleParams, encodeDataStreamData } from "../../utils/oracle";
import { errorsContract } from "../../utils/error";
import * as keys from "../../utils/keys";

describe("Oracle", () => {
  let signers;
  let dataStore, oracle, wnt, wbtc, usdc;
  let oracleSalt, signerIndexes;

  beforeEach(async () => {
    const fixture = await deployFixture();
    ({ signers } = fixture.accounts);

    ({ dataStore, oracle, wnt, wbtc, usdc } = fixture.contracts);
    ({ oracleSalt, signerIndexes } = fixture.props);
  });

  it("setPrices", async () => {
    const block = await ethers.provider.getBlock();

    await dataStore.setBytes32(keys.dataStreamIdKey(wbtc.address), hashString("WBTC"));
    await dataStore.setUint(keys.dataStreamMultiplierKey(wbtc.address), expandDecimals(1, 34));

    const params = await getOracleParams({
      oracleSalt,
      minOracleBlockNumbers: [block.number],
      maxOracleBlockNumbers: [block.number],
      oracleTimestamps: [block.timestamp],
      blockHashes: [block.hash],
      signerIndexes,
      tokens: [wnt.address],
      tokenOracleTypes: [TOKEN_ORACLE_TYPES.DEFAULT],
      precisions: [8],
      minPrices: [expandDecimals(5000, 4)],
      maxPrices: [expandDecimals(5000, 4)],
      signers,
      dataStreamTokens: [wbtc.address],
      dataStreamData: [
        encodeDataStreamData({
          feedId: hashString("WBTC"),
          validFromTimestamp: block.timestamp - 2,
          observationsTimestamp: block.timestamp - 1,
          nativeFee: 0,
          linkFee: 0,
          expiresAt: block.timestamp + 200,
          price: 100_000,
          bid: 100_000 - 1,
          ask: 100_000 + 1,
        }),
      ],
      priceFeedTokens: [usdc.address],
    });

    await oracle.setPrices(params);

    expect(await oracle.getTokensWithPrices(0, 10)).eql([wnt.address, usdc.address, wbtc.address]);

    expect((await oracle.primaryPrices(wnt.address))[0]).eq("5000000000000000");
    expect((await oracle.primaryPrices(wnt.address))[1]).eq("5000000000000000");

    expect((await oracle.primaryPrices(wbtc.address))[0]).eq("999990000");
    expect((await oracle.primaryPrices(wbtc.address))[1]).eq("1000010000");

    expect((await oracle.primaryPrices(usdc.address))[0]).eq("1000000000000000000000000");
    expect((await oracle.primaryPrices(usdc.address))[1]).eq("1000000000000000000000000");

    expect(await oracle.minTimestamp()).eq(block.timestamp - 1);
    expect(await oracle.maxTimestamp()).gt(block.timestamp);

    await expect(
      oracle.setPrices({
        tokens: [wnt.address],
        providers: [wbtc.address],
        data: ["0x"],
      })
    ).to.be.revertedWithCustomError(errorsContract, "InvalidOracleProvider");
  });
});
