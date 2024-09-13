import { expect } from "chai";
import { deployFixture } from "../../utils/fixture";

import { parametersList, maxPnlFactorForTradersLongs, getDataForKey } from "../../utils/configSyncer";
import { getFullKey } from "../../utils/config";
import { grantRole } from "../../utils/role";
import { encodeData } from "../../utils/hash";
import { errorsContract } from "../../utils/error";
import { parseLogs } from "../../utils/event";
import * as keys from "../../utils/keys";

describe("ConfigSyncer", () => {
  let fixture;
  let wallet, user0, user1, user2;
  let configSyncer, dataStore, roleStore, mockRiskOracle, ethUsdMarket, btcUsdMarket;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ configSyncer, dataStore, roleStore, mockRiskOracle, ethUsdMarket, btcUsdMarket } = fixture.contracts);
    ({ wallet, user0, user1, user2 } = fixture.accounts);

    await grantRole(roleStore, user0.address, "CONFIG_KEEPER");
    await grantRole(roleStore, user1.address, "LIMITED_CONFIG_KEEPER");
    await grantRole(roleStore, user2.address, "CONTROLLER");

    const referenceIds = Array(parametersList.length).fill("NotApplicable");
    const newValues: string[] = [];
    const updateTypes: string[] = [];
    const markets = Array(parametersList.length).fill(ethUsdMarket.marketToken);
    const additionalData: string[] = [];
    for (let i = 0; i < parametersList.length; i++) {
      const hexValue = ethers.utils.hexValue(2000000 + i);
      const data = getDataForKey(
        parametersList[i],
        ethUsdMarket.marketToken,
        ethUsdMarket.longToken,
        ethUsdMarket.shortToken
      );
      const encodedData = encodeData(["bytes32", "bytes"], [parametersList[i].baseKey, data]);
      updateTypes.push(parametersList[i].parameterName);
      additionalData.push(encodedData);

      if (i < parametersList.length - 2) {
        newValues.push(hexValue);
      } else if (i < parametersList.length - 1) {
        const paddedHex = "0x00" + hexValue.slice(2);
        newValues.push(paddedHex);
      } else {
        const paddedHex32Bytes = "0x" + hexValue.slice(2).padStart(64, "0");
        newValues.push(paddedHex32Bytes);
      }
    }
    await mockRiskOracle
      .connect(wallet)
      .publishBulkRiskParameterUpdates(referenceIds, newValues, updateTypes, markets, additionalData);
  });

  it("reverts when an unauthorized account attempts to sync", async () => {
    const market = ethUsdMarket.marketToken;
    const parameter = parametersList[0].parameterName;

    await expect(configSyncer.connect(user0).sync([market], [parameter])).to.be.revertedWithCustomError(
      errorsContract,
      "Unauthorized"
    );
  });

  it("reverts when no update is found for market and parameter", async () => {
    const markets = btcUsdMarket.marketToken;
    const parameter = parametersList[0].parameterName;

    await expect(configSyncer.connect(user1).sync([markets], [parameter])).to.be.revertedWith(
      "No update found for the specified parameter and market."
    );
  });

  it("reverts when number of markets and parameters don't match", async () => {
    const markets = Array(parametersList.length + 1).fill(ethUsdMarket.marketToken);
    const parameters: string[] = [];
    for (let i = parametersList.length - 1; i >= 0; i--) {
      parameters.push(parametersList[i].parameterName);
    }

    await expect(configSyncer.connect(user1).sync(markets, parameters)).to.be.revertedWithCustomError(
      errorsContract,
      "SyncConfigInvalidInputLengths"
    );
  });

  it("reverts when updates for a market are disabled", async () => {
    const market = ethUsdMarket.marketToken;
    const parameter = parametersList[0].parameterName;

    await dataStore.connect(user2).setBool(keys.syncConfigMarketDisabledKey(market), true);

    await expect(configSyncer.connect(user1).sync([market], [parameter])).to.be.revertedWithCustomError(
      errorsContract,
      "SyncConfigUpdatesDisabledForMarket"
    );
  });

  it("reverts when updates for a parameter are disabled", async () => {
    const market = ethUsdMarket.marketToken;
    const parameter = parametersList[0].parameterName;

    await dataStore.connect(user2).setBool(keys.syncConfigParameterDisabledKey(parameter), true);

    await expect(configSyncer.connect(user1).sync([market], [parameter])).to.be.revertedWithCustomError(
      errorsContract,
      "SyncConfigUpdatesDisabledForParameter"
    );
  });

  it("reverts when updates for a market parameter are disabled", async () => {
    const market = ethUsdMarket.marketToken;
    const parameter = parametersList[0].parameterName;

    await dataStore.connect(user2).setBool(keys.syncConfigMarketParameterDisabledKey(market, parameter), true);

    await expect(configSyncer.connect(user1).sync([market], [parameter])).to.be.revertedWithCustomError(
      errorsContract,
      "SyncConfigUpdatesDisabledForMarketParameter"
    );
  });

  it("reverts when the SyncConfig feature is disabled", async () => {
    const market = ethUsdMarket.marketToken;
    const parameter = parametersList[0].parameterName;

    await dataStore.connect(user2).setBool(keys.syncConfigFeatureDisabledKey(configSyncer.address), true);

    await expect(configSyncer.connect(user1).sync([market], [parameter])).to.be.revertedWithCustomError(
      errorsContract,
      "DisabledFeature"
    );
  });

  it("reverts when market does not equal market from data", async () => {
    if (parametersList[0].parameterFormat === "parameterFormat4") {
      throw new Error(
        'Make sure parameterList[0].parameterFormat does not equal "parameterFormat4" or part of this test is redundant'
      );
    }

    const hexValue = ethers.utils.hexValue(2000000);
    const market = btcUsdMarket.marketToken;
    const parameter1 = parametersList[0].parameterName;
    const parameter2 = maxPnlFactorForTradersLongs.parameterName;

    const data1 = getDataForKey(
      parametersList[0],
      ethUsdMarket.marketToken,
      ethUsdMarket.longToken,
      ethUsdMarket.shortToken
    );
    const data2 = getDataForKey(
      maxPnlFactorForTradersLongs,
      ethUsdMarket.marketToken,
      ethUsdMarket.longToken,
      ethUsdMarket.shortToken
    );

    const additionalData1 = encodeData(["bytes32", "bytes"], [parametersList[0].baseKey, data1]);
    const additionalData2 = encodeData(["bytes32", "bytes"], [maxPnlFactorForTradersLongs.baseKey, data2]);

    const referenceIds = Array(2).fill("NotApplicable");
    const newValues = Array(2).fill(hexValue);
    const updateTypes: string[] = [parameter1, parameter2];
    const markets = Array(2).fill(market);
    const additionalData: string[] = [additionalData1, additionalData2];
    await mockRiskOracle
      .connect(wallet)
      .publishBulkRiskParameterUpdates(referenceIds, newValues, updateTypes, markets, additionalData);

    await expect(configSyncer.connect(user1).sync([market], [parameter1])).to.be.revertedWithCustomError(
      errorsContract,
      "SyncConfigInvalidMarketFromData"
    );

    await expect(configSyncer.connect(user1).sync([market], [parameter2])).to.be.revertedWithCustomError(
      errorsContract,
      "SyncConfigInvalidMarketFromData"
    );
  });

  it("reverts when a parameter's baseKey is not whitelisted", async () => {
    const market = ethUsdMarket.marketToken;
    const parameter = maxPnlFactorForTradersLongs.parameterName;

    const referenceId = "NotApplicable";
    const newValue = ethers.utils.hexValue(2000000);
    const data = getDataForKey(
      maxPnlFactorForTradersLongs,
      ethUsdMarket.marketToken,
      ethUsdMarket.longToken,
      ethUsdMarket.shortToken
    );
    const additionalData = encodeData(["bytes32", "bytes"], [maxPnlFactorForTradersLongs.baseKey, data]);
    await mockRiskOracle
      .connect(wallet)
      .publishRiskParameterUpdate(referenceId, newValue, parameter, market, additionalData);

    await expect(configSyncer.connect(user1).sync([market], [parameter])).to.be.revertedWithCustomError(
      errorsContract,
      "InvalidBaseKey"
    );
  });

  it("allows LIMITED_CONFIG_KEEPER to sync a single update", async () => {
    const market = ethUsdMarket.marketToken;
    const parameter = parametersList[0].parameterName;
    await configSyncer.connect(user1).sync([market], [parameter]);

    const update = await mockRiskOracle.getLatestUpdateByParameterAndMarket(parameter, market);
    expect(await dataStore.getBool(keys.syncConfigUpdateCompletedKey(update.updateId))).to.be.true;
    expect(await dataStore.getUint(keys.syncConfigLatestUpdateIdKey())).to.equal(update.updateId);

    const [baseKey, data] = ethers.utils.defaultAbiCoder.decode(["bytes32", "bytes"], update.additionalData);
    const fullKey = getFullKey(baseKey, data);
    expect(await dataStore.getUint(fullKey)).to.equal(update.newValue);

    const hexValue = ethers.utils.hexValue(2000000);
    const keyData = getDataForKey(
      parametersList[0],
      ethUsdMarket.marketToken,
      ethUsdMarket.longToken,
      ethUsdMarket.shortToken
    );
    const encodedData = encodeData(["bytes32", "bytes"], [parametersList[0].baseKey, keyData]);
    expect(update.referenceId).to.equal("NotApplicable");
    expect(update.newValue).to.equal(hexValue);
    expect(update.updateType).to.equal(parameter);
    expect(update.market).to.equal(market);
    expect(update.additionalData).to.equal(encodedData);
    expect(update.timestamp).to.be.gt(0);
    expect(update.updateId).to.equal(1);
    expect(update.previousValue).to.equal("0x");
  });

  it("allows LIMITED_CONFIG_KEEPER to sync multiple updates", async () => {
    const markets = Array(parametersList.length).fill(ethUsdMarket.marketToken);
    const parameters: string[] = [];
    const newValues: string[] = [];
    for (let i = parametersList.length - 1; i >= 0; i--) {
      parameters.push(parametersList[i].parameterName);
      const hexValue = ethers.utils.hexValue(2000000 + i);
      if (i < parametersList.length - 2) {
        newValues.push(hexValue);
      } else if (i < parametersList.length - 1) {
        const paddedHex = "0x00" + hexValue.slice(2);
        newValues.push(paddedHex);
      } else {
        const paddedHex32Bytes = "0x" + hexValue.slice(2).padStart(64, "0");
        newValues.push(paddedHex32Bytes);
      }
    }

    let latestUpdateId = await dataStore.getUint(keys.syncConfigLatestUpdateIdKey());

    await configSyncer.connect(user1).sync(markets, parameters);

    for (let i = 0; i < parameters.length; i++) {
      const parameter = parameters[i];
      const market = markets[i];
      const update = await mockRiskOracle.getLatestUpdateByParameterAndMarket(parameter, market);
      expect(await dataStore.getBool(keys.syncConfigUpdateCompletedKey(update.updateId))).to.be.true;

      if (update.updateId > latestUpdateId) {
        latestUpdateId = update.updateId;
      }

      if (i === parameters.length - 1) {
        expect(await dataStore.getUint(keys.syncConfigLatestUpdateIdKey())).to.equal(latestUpdateId);
      }

      const [baseKey, data] = ethers.utils.defaultAbiCoder.decode(["bytes32", "bytes"], update.additionalData);
      const fullKey = getFullKey(baseKey, data);
      expect(await dataStore.getUint(fullKey)).to.equal(update.newValue);

      const hexValue = newValues[i];
      const keyData = getDataForKey(
        parametersList[4 - i],
        ethUsdMarket.marketToken,
        ethUsdMarket.longToken,
        ethUsdMarket.shortToken
      );
      const encodedData = encodeData(["bytes32", "bytes"], [parametersList[4 - i].baseKey, keyData]);
      expect(update.referenceId).to.equal("NotApplicable");
      expect(update.newValue).to.equal(hexValue);
      expect(update.updateType).to.equal(parameter);
      expect(update.market).to.equal(market);
      expect(update.additionalData).to.equal(encodedData);
      expect(update.timestamp).to.be.gt(0);
      expect(update.updateId).to.equal(5 - i);
      expect(update.previousValue).to.equal("0x");
    }
  });

  it("SYNC_CONFIG_LATEST_UPDATE_ID still equals latest update ID", async () => {
    const market = ethUsdMarket.marketToken;
    const parameter = parametersList[parametersList.length - 1].parameterName;
    await configSyncer.connect(user1).sync([market], [parameter]);

    const update = await mockRiskOracle.getLatestUpdateByParameterAndMarket(parameter, market);
    expect(await dataStore.getBool(keys.syncConfigUpdateCompletedKey(update.updateId))).to.be.true;

    const latestUpdateId = update.updateId;
    expect(await dataStore.getUint(keys.syncConfigLatestUpdateIdKey())).to.equal(latestUpdateId);

    const [baseKey, data] = ethers.utils.defaultAbiCoder.decode(["bytes32", "bytes"], update.additionalData);
    const fullKey = getFullKey(baseKey, data);
    expect(await dataStore.getUint(fullKey)).to.equal(update.newValue);

    const hexValue = "0x" + ethers.utils.hexValue(2000004).slice(2).padStart(64, "0");
    const keyData = getDataForKey(
      parametersList[parametersList.length - 1],
      ethUsdMarket.marketToken,
      ethUsdMarket.longToken,
      ethUsdMarket.shortToken
    );
    const encodedData = encodeData(["bytes32", "bytes"], [parametersList[parametersList.length - 1].baseKey, keyData]);
    expect(update.referenceId).to.equal("NotApplicable");
    expect(update.newValue).to.equal(hexValue);
    expect(update.updateType).to.equal(parameter);
    expect(update.market).to.equal(market);
    expect(update.additionalData).to.equal(encodedData);
    expect(update.timestamp).to.be.gt(0);
    expect(update.updateId).to.equal(5);
    expect(update.previousValue).to.equal("0x");

    const markets = Array(parametersList.length - 1).fill(ethUsdMarket.marketToken);
    const parameters: string[] = [];
    const newValues: string[] = [];
    for (let i = parametersList.length - 2; i >= 0; i--) {
      parameters.push(parametersList[i].parameterName);
      const hexValue = ethers.utils.hexValue(2000000 + i);
      if (i < parametersList.length - 2) {
        newValues.push(hexValue);
      } else {
        const paddedHex = "0x00" + hexValue.slice(2);
        newValues.push(paddedHex);
      }
    }

    await configSyncer.connect(user1).sync(markets, parameters);

    for (let i = 0; i < parameters.length; i++) {
      const parameter = parameters[i];
      const market = markets[i];
      const update = await mockRiskOracle.getLatestUpdateByParameterAndMarket(parameter, market);
      expect(await dataStore.getBool(keys.syncConfigUpdateCompletedKey(update.updateId))).to.be.true;

      const [baseKey, data] = ethers.utils.defaultAbiCoder.decode(["bytes32", "bytes"], update.additionalData);
      const fullKey = getFullKey(baseKey, data);
      expect(await dataStore.getUint(fullKey)).to.equal(update.newValue);

      const hexValue = newValues[i];
      const keyData = getDataForKey(
        parametersList[3 - i],
        ethUsdMarket.marketToken,
        ethUsdMarket.longToken,
        ethUsdMarket.shortToken
      );
      const encodedData = encodeData(["bytes32", "bytes"], [parametersList[3 - i].baseKey, keyData]);
      expect(update.referenceId).to.equal("NotApplicable");
      expect(update.newValue).to.equal(hexValue);
      expect(update.updateType).to.equal(parameter);
      expect(update.market).to.equal(market);
      expect(update.additionalData).to.equal(encodedData);
      expect(update.timestamp).to.be.gt(0);
      expect(update.updateId).to.equal(4 - i);
      expect(update.previousValue).to.equal("0x");
    }

    expect(await dataStore.getUint(keys.syncConfigLatestUpdateIdKey())).to.equal(latestUpdateId);
  });

  it("skips if update for market parameter was already applied", async () => {
    const market = ethUsdMarket.marketToken;
    const parameter = parametersList[1].parameterName;
    const tx1 = await configSyncer.connect(user1).sync([market], [parameter]);
    const receipt1 = await tx1.wait();
    const parsedEventLogs1 = parseLogs(fixture, receipt1).filter(
      (log) => log.parsedEventInfo.eventName === "SyncConfig"
    );
    const eventData1 = parsedEventLogs1[0].parsedEventData;
    expect(parsedEventLogs1.length).to.equal(1);
    expect(eventData1.updateApplied).to.be.true;

    const update = await mockRiskOracle.getLatestUpdateByParameterAndMarket(parameter, market);
    expect(await dataStore.getBool(keys.syncConfigUpdateCompletedKey(update.updateId))).to.be.true;
    expect(await dataStore.getUint(keys.syncConfigLatestUpdateIdKey())).to.equal(update.updateId);

    const [baseKey, data] = ethers.utils.defaultAbiCoder.decode(["bytes32", "bytes"], update.additionalData);
    const fullKey = getFullKey(baseKey, data);
    expect(await dataStore.getUint(fullKey)).to.equal(update.newValue);

    const hexValue = ethers.utils.hexValue(2000001);
    const keyData = getDataForKey(
      parametersList[1],
      ethUsdMarket.marketToken,
      ethUsdMarket.longToken,
      ethUsdMarket.shortToken
    );
    const encodedData = encodeData(["bytes32", "bytes"], [parametersList[1].baseKey, keyData]);
    expect(update.referenceId).to.equal("NotApplicable");
    expect(update.newValue).to.equal(hexValue);
    expect(update.updateType).to.equal(parameter);
    expect(update.market).to.equal(market);
    expect(update.additionalData).to.equal(encodedData);
    expect(update.timestamp).to.be.gt(0);
    expect(update.updateId).to.equal(2);
    expect(update.previousValue).to.equal("0x");

    const markets = Array(parametersList.length).fill(ethUsdMarket.marketToken);
    const parameters: string[] = [];
    const newValues: string[] = [];
    for (let i = parametersList.length - 1; i >= 0; i--) {
      parameters.push(parametersList[i].parameterName);
      const hexValue = ethers.utils.hexValue(2000000 + i);
      if (i < parametersList.length - 2) {
        newValues.push(hexValue);
      } else if (i < parametersList.length - 1) {
        const paddedHex = "0x00" + hexValue.slice(2);
        newValues.push(paddedHex);
      } else {
        const paddedHex32Bytes = "0x" + hexValue.slice(2).padStart(64, "0");
        newValues.push(paddedHex32Bytes);
      }
    }

    let latestUpdateId = await dataStore.getUint(keys.syncConfigLatestUpdateIdKey());

    const tx2 = await configSyncer.connect(user1).sync(markets, parameters);
    const receipt2 = await tx2.wait();
    const parsedEventLogs2 = parseLogs(fixture, receipt2).filter(
      (log) => log.parsedEventInfo.eventName === "SyncConfig"
    );
    const eventData2 = parsedEventLogs2[parameters.length - 2].parsedEventData;
    const eventData3 = parsedEventLogs2[parameters.length - 1].parsedEventData;
    expect(parsedEventLogs2.length).to.equal(5);
    expect(eventData2.updateApplied).to.be.false;
    expect(eventData3.updateApplied).to.be.true;

    for (let i = 0; i < parameters.length; i++) {
      const parameter = parameters[i];
      const market = markets[i];
      const update = await mockRiskOracle.getLatestUpdateByParameterAndMarket(parameter, market);
      expect(await dataStore.getBool(keys.syncConfigUpdateCompletedKey(update.updateId))).to.be.true;

      if (update.updateId > latestUpdateId) {
        latestUpdateId = update.updateId;
      }

      if (i === parameters.length - 1) {
        expect(await dataStore.getUint(keys.syncConfigLatestUpdateIdKey())).to.equal(latestUpdateId);
      }

      const [baseKey, data] = ethers.utils.defaultAbiCoder.decode(["bytes32", "bytes"], update.additionalData);
      const fullKey = getFullKey(baseKey, data);
      expect(await dataStore.getUint(fullKey)).to.equal(update.newValue);

      const hexValue = newValues[i];
      const keyData = getDataForKey(
        parametersList[4 - i],
        ethUsdMarket.marketToken,
        ethUsdMarket.longToken,
        ethUsdMarket.shortToken
      );
      const encodedData = encodeData(["bytes32", "bytes"], [parametersList[4 - i].baseKey, keyData]);
      expect(update.referenceId).to.equal("NotApplicable");
      expect(update.newValue).to.equal(hexValue);
      expect(update.updateType).to.equal(parameter);
      expect(update.market).to.equal(market);
      expect(update.additionalData).to.equal(encodedData);
      expect(update.timestamp).to.be.gt(0);
      expect(update.updateId).to.equal(5 - i);
      expect(update.previousValue).to.equal("0x");
    }
  });
});
