import { expect } from "chai";
import { deployFixture } from "../../utils/fixture";

import { encodeData } from "../../utils/hash";
import { expandDecimals, percentageToFloat } from "../../utils/math";
import * as keys from "../../utils/keys";
import { ethers } from "hardhat";
import { BigNumberish } from "ethers";
import { decodeValidatedPrice } from "../../utils/oracle-provider";

function encodeReport(
  feedId: string,
  bid: BigNumberish,
  ask: BigNumberish,
  {
    validFromTimestamp = 1,
    observationsTimestamp = 1732209862,
  }: { validFromTimestamp?: BigNumberish; observationsTimestamp?: BigNumberish } = {}
) {
  return encodeData(
    ["bytes32", "uint32", "uint32", "uint192", "uint192", "uint32", "int192", "int192", "int192"],
    [feedId, validFromTimestamp, observationsTimestamp, 1732209872, 4, 5, 6, bid, ask]
  );
}

describe("ChainlinkDataStreamProvider", () => {
  const feedId = "0x0000000000000000000000000000000000000000000000000000000000000001";

  let fixture;
  let dataStore, chainlinkDataStreamProvider, wnt, oracle;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ dataStore, chainlinkDataStreamProvider, wnt, oracle } = fixture.contracts);

    await dataStore.setBytes32(keys.dataStreamIdKey(wnt.address), feedId);
    await dataStore.setUint(keys.dataStreamMultiplierKey(wnt.address), expandDecimals(1, 30));
  });

  async function getOraclePrice(report: string) {
    const callData = chainlinkDataStreamProvider.interface.encodeFunctionData("getOraclePrice", [wnt.address, report]);

    const result = await ethers.provider.call({
      to: chainlinkDataStreamProvider.address,
      data: callData,
      from: oracle.address,
    });

    return decodeValidatedPrice(result);
  }

  async function getOraclePriceError(report: string) {
    try {
      await getOraclePrice(report);
      return null;
    } catch (e) {
      return e;
    }
  }

  it("data stream spread", async () => {
    async function getPrice() {
      return getOraclePrice(encodeReport(feedId, 99999990, 100000010));
    }

    await dataStore.setUint(keys.dataStreamSpreadReductionFactorKey(wnt.address), 0);
    const oraclePriceA = await getPrice();
    expect(oraclePriceA.min).eq(99999990);
    expect(oraclePriceA.max).eq(100000010);

    await dataStore.setUint(keys.dataStreamSpreadReductionFactorKey(wnt.address), percentageToFloat("90%"));
    const oraclePriceB = await getPrice();

    expect(oraclePriceB.min).eq(99999999);
    expect(oraclePriceB.max).eq(100000001);

    await dataStore.setUint(keys.dataStreamSpreadReductionFactorKey(wnt.address), percentageToFloat("100%"));
    const oraclePriceC = await getPrice();

    expect(oraclePriceC.min).eq(100000000);
    expect(oraclePriceC.max).eq(100000000);

    await dataStore.setUint(keys.dataStreamSpreadReductionFactorKey(wnt.address), percentageToFloat("300%"));
    await expect(getPrice()).to.be.rejected;
  });

  it("uses observationsTimestamp as the validated price timestamp", async () => {
    const price = await getOraclePrice(
      encodeReport(feedId, 99999990, 100000010, { validFromTimestamp: 1000, observationsTimestamp: 1010 })
    );

    expect(price.timestamp).eq(1010);
  });

  it("reverts if validFromTimestamp is after observationsTimestamp", async () => {
    const error = await getOraclePriceError(
      encodeReport(feedId, 99999990, 100000010, { validFromTimestamp: 1011, observationsTimestamp: 1010 })
    );

    expect(error, "expected getOraclePrice to revert").to.not.be.null;
    expect(error.name).eq("InvalidDataStreamTimestamps");
    expect(error.args.validFromTimestamp).eq(1011);
    expect(error.args.observationsTimestamp).eq(1010);
  });

  it("reverts if the report interval exceeds the configured max", async () => {
    await dataStore.setUint(keys.dataStreamMaxIntervalKey(wnt.address), 5);

    const error = await getOraclePriceError(
      encodeReport(feedId, 99999990, 100000010, { validFromTimestamp: 1000, observationsTimestamp: 1006 })
    );

    expect(error, "expected getOraclePrice to revert").to.not.be.null;
    expect(error.name).eq("MaxDataStreamIntervalExceeded");
    expect(error.args.validFromTimestamp).eq(1000);
    expect(error.args.observationsTimestamp).eq(1006);
    expect(error.args.maxInterval).eq(5);
  });

  it("allows a report interval equal to the configured max", async () => {
    await dataStore.setUint(keys.dataStreamMaxIntervalKey(wnt.address), 5);

    const price = await getOraclePrice(
      encodeReport(feedId, 99999990, 100000010, { validFromTimestamp: 1000, observationsTimestamp: 1005 })
    );

    expect(price.timestamp).eq(1005);
  });

  it("does not enforce the interval when the max is unset", async () => {
    const price = await getOraclePrice(
      encodeReport(feedId, 99999990, 100000010, { validFromTimestamp: 1000, observationsTimestamp: 1000000 })
    );

    expect(price.timestamp).eq(1000000);
  });
});
