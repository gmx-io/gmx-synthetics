import { deployFixture } from "../../utils/fixture";
import { expect } from "chai";
import * as keys from "../../utils/keys";
import { encodeData, encodePackedData } from "../../utils/hash";

describe("Guardian.ConfigSyncer", () => {
  const { provider } = ethers;

  let fixture;
  let dataStore, ethUsdMarket, wnt, configSyncer, mockRiskOracle;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ dataStore, ethUsdMarket, wnt, configSyncer, mockRiskOracle } = fixture.contracts);
  });

  it("No risk update results in a revert upon sync", async () => {
    // Attempt to sync an update that doesn't exist
    const markets = [ethUsdMarket.marketToken];
    const updateTypes = ["maxLongTokenPoolAmount"];

    await expect(configSyncer.sync(markets, updateTypes)).to.be.revertedWith(
      "No update found for the specified parameter and market."
    );
  });

  it("Syncs key which uses extra data", async () => {
    let updateCounter = await mockRiskOracle.updateCounter();
    expect(updateCounter).to.equal(0);

    let latestUpdateId = await dataStore.getUint(keys.SYNC_CONFIG_LATEST_UPDATE_ID);
    expect(latestUpdateId).to.eq(0);

    // Check initial maxLongTokenPoolAmount
    let maxLongTokenPoolAmount = await dataStore.getUint(keys.maxPoolAmountKey(ethUsdMarket.marketToken, wnt.address));

    expect(maxLongTokenPoolAmount).to.equal("1000000000000000000000000000");

    // New value is 7
    const newVal = 7;

    const referenceId = "X";
    const newValue = encodeData(["uint256"], [newVal]);
    const updateType = "maxLongTokenPoolAmount";
    const market = encodePackedData(["address"], [ethUsdMarket.marketToken]);
    const keyData = encodeData(["address", "address"], [ethUsdMarket.marketToken, wnt.address]);
    const additionalData = encodeData(["bytes32", "bytes"], [keys.MAX_POOL_AMOUNT, keyData]);

    await mockRiskOracle.publishRiskParameterUpdate(referenceId, newValue, updateType, market, additionalData);

    // The update has been recorded
    updateCounter = await mockRiskOracle.updateCounter();
    expect(updateCounter).to.equal(1);

    const latestUpdate = await mockRiskOracle.getLatestUpdateByParameterAndMarket(updateType, market);

    expect(latestUpdate.referenceId).to.equal(referenceId);
    expect(latestUpdate.newValue).to.equal(newValue);
    expect(latestUpdate.updateType).to.equal(updateType);
    expect(latestUpdate.market).to.equal(market);
    expect(latestUpdate.additionalData).to.equal(additionalData);
    expect(latestUpdate.timestamp).to.be.gt(0);
    expect(latestUpdate.updateId).to.equal(1);
    expect(latestUpdate.previousValue).to.eq("0x");

    await configSyncer.sync([ethUsdMarket.marketToken], [updateType]);

    maxLongTokenPoolAmount = await dataStore.getUint(keys.maxPoolAmountKey(ethUsdMarket.marketToken, wnt.address));
    expect(maxLongTokenPoolAmount).to.equal(newVal);

    latestUpdateId = await dataStore.getUint(keys.SYNC_CONFIG_LATEST_UPDATE_ID);
    expect(latestUpdateId).to.eq(1);
  });

  it("Syncs key with no extra data", async () => {
    let updateCounter = await mockRiskOracle.updateCounter();
    expect(updateCounter).to.equal(0);

    let latestUpdateId = await dataStore.getUint(keys.SYNC_CONFIG_LATEST_UPDATE_ID);
    expect(latestUpdateId).to.eq(0);

    // Check initial swapOrderGasLimit
    let swapOrderGasLimit = await dataStore.getUint(keys.SWAP_ORDER_GAS_LIMIT);

    expect(swapOrderGasLimit).to.equal(0);

    const newVal = 700_000;

    const referenceId = "X";
    const newValue = encodeData(["uint256"], [newVal]);
    const updateType = "swapOrderGasLimit";
    const market = encodePackedData(["address"], [ethUsdMarket.marketToken]);
    const additionalData = encodeData(["bytes32", "bytes"], [keys.SWAP_ORDER_GAS_LIMIT, "0x"]);

    await mockRiskOracle.publishRiskParameterUpdate(referenceId, newValue, updateType, market, additionalData);

    // The update has been recorded
    updateCounter = await mockRiskOracle.updateCounter();
    expect(updateCounter).to.equal(1);

    const latestUpdate = await mockRiskOracle.getLatestUpdateByParameterAndMarket(updateType, market);

    expect(latestUpdate.referenceId).to.equal(referenceId);
    expect(latestUpdate.newValue).to.equal(newValue);
    expect(latestUpdate.updateType).to.equal(updateType);
    expect(latestUpdate.market).to.equal(market);
    expect(latestUpdate.additionalData).to.equal(additionalData);
    expect(latestUpdate.timestamp).to.be.gt(0);
    expect(latestUpdate.updateId).to.equal(1);
    expect(latestUpdate.previousValue).to.eq("0x");

    await configSyncer.sync([ethUsdMarket.marketToken], [updateType]);

    swapOrderGasLimit = await dataStore.getUint(keys.SWAP_ORDER_GAS_LIMIT);
    expect(swapOrderGasLimit).to.equal(newVal);

    latestUpdateId = await dataStore.getUint(keys.SYNC_CONFIG_LATEST_UPDATE_ID);
    expect(latestUpdateId).to.eq(1);
  });
});
