import { expect } from "chai";
import { deployFixture } from "../../utils/fixture";

import { parametersList, getDataForKey, maxPnlFactorForTradersLongs } from "../../utils/configSyncer";
import { getFullKey } from "../../utils/config";
import { grantRole } from "../../utils/role";
import { encodeData } from "../../utils/hash";
import { errorsContract } from "../../utils/error";
import { parseLogs } from "../../utils/event"
import * as keys from "../../utils/keys";

describe("ConfigSyncer", () => {
  let fixture;
  let wallet, user0, user1, user2;
  let configSyncer, dataStore, roleStore, mockRiskOracle, ethUsdMarket;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ configSyncer, dataStore, roleStore, mockRiskOracle, ethUsdMarket } = fixture.contracts);
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
      // Sets a unique value for each parameter and added logic to make 2 of the 5 test values left padded to validate Cast.bytesToUint256 function used in sync
      const hexValue = ethers.utils.hexValue(2000000 + i);
      const data = getDataForKey(parametersList[i], ethUsdMarket.marketToken, ethUsdMarket.longToken, ethUsdMarket.shortToken);
      const encodedData = encodeData(["bytes32", "bytes"], [parametersList[i].baseKey, data]);
      updateTypes.push(parametersList[i].parameterName);
      additionalData.push(encodedData);

      if (i < (parametersList.length - 2)) {
        newValues.push(hexValue);
      }
      else if (i < (parametersList.length - 1)) {
        const paddedHex = "0x00" + hexValue.slice(2);
        newValues.push(paddedHex);
      }
      else {
        const paddedHex32Bytes = "0x" + hexValue.slice(2).padStart(64, '0');
        newValues.push(paddedHex32Bytes);
      }
    }
    await mockRiskOracle.connect(wallet).publishBulkRiskParameterUpdates(referenceIds, newValues, updateTypes, markets, additionalData);
  });

  it("reverts when unauthorized account attempts to sync", async () => {
    const market = ethUsdMarket.marketToken;
    const parameter = parametersList[0].parameterName;
  
    await expect(
      configSyncer.connect(user0).sync([market], [parameter])
    ).to.be.revertedWithCustomError(errorsContract, "Unauthorized");
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
  });

  it("allows LIMITED_CONFIG_KEEPER to sync multiple updates", async () => {
    const markets = Array(parametersList.length).fill(ethUsdMarket.marketToken);
    const parameters: string[] = [];
    
    // Assigning the parameters in reverse order to validate that the order of parameters and markets does not matter (as long as the indices are aligned)
    for (let i = (parametersList.length - 1); i >= 0; i--) {
      parameters.push(parametersList[i].parameterName);
    }
    
    let latestUpdateId = await dataStore.getUint(keys.syncConfigLatestUpdateIdKey());

    await configSyncer.connect(user1).sync(markets, parameters);
    
    for (let i = 0; i < parameters.length; i++) {
      const update = await mockRiskOracle.getLatestUpdateByParameterAndMarket(parameters[i], markets[i]);
      expect(await dataStore.getBool(keys.syncConfigUpdateCompletedKey(update.updateId))).to.be.true;
      
      if (update.updateId > latestUpdateId) {
        latestUpdateId = update.updateId;
      }

      if (i === (parameters.length - 1)) {
        expect(await dataStore.getUint(keys.syncConfigLatestUpdateIdKey())).to.equal(latestUpdateId);
      }
      
      const [baseKey, data] = ethers.utils.defaultAbiCoder.decode(["bytes32", "bytes"], update.additionalData);
      const fullKey = getFullKey(baseKey, data);
      expect(await dataStore.getUint(fullKey)).to.equal(update.newValue);
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

    const markets = Array(parametersList.length - 1).fill(ethUsdMarket.marketToken);
    const parameters: string[] = [];
    for (let i = (parametersList.length - 2); i >= 0; i--) {
      parameters.push(parametersList[i].parameterName);
    }

    await configSyncer.connect(user1).sync(markets, parameters);
    
    for (let i = 0; i < parameters.length; i++) {
      const update = await mockRiskOracle.getLatestUpdateByParameterAndMarket(parameters[i], markets[i]);
      expect(await dataStore.getBool(keys.syncConfigUpdateCompletedKey(update.updateId))).to.be.true;

      const [baseKey, data] = ethers.utils.defaultAbiCoder.decode(["bytes32", "bytes"], update.additionalData);
      const fullKey = getFullKey(baseKey, data);
      expect(await dataStore.getUint(fullKey)).to.equal(update.newValue);
    }

    expect(await dataStore.getUint(keys.syncConfigLatestUpdateIdKey())).to.equal(latestUpdateId);
  });

  it("reverts when number of markets and parameters don't match", async () => {
    const markets = Array(parametersList.length + 1).fill(ethUsdMarket.marketToken);
    const parameters: string[] = [];
    for (let i = (parametersList.length - 1); i >= 0; i--) {
      parameters.push(parametersList[i].parameterName);
    }
  
    await expect(
      configSyncer.connect(user1).sync(markets, parameters)
    ).to.be.revertedWithCustomError(errorsContract, "SyncConfigInvalidInputLengths");
  });

  it("skips if update for market parameter was already applied", async () => {
    const market = ethUsdMarket.marketToken;
    const parameter = parametersList[1].parameterName; // Chose 2nd to last parameter (given reversed) that will be updated in batch update to verify that it is skipped and last one still gets updated
    const tx1 = await configSyncer.connect(user1).sync([market], [parameter]);
    const receipt1 = await tx1.wait();
    const parsedEventLogs1 = parseLogs(fixture, receipt1).filter(log => log.parsedEventInfo.eventName === "SyncConfig");
    const eventData1 = parsedEventLogs1[0].parsedEventData;
    expect(parsedEventLogs1.length).to.equal(1);
    expect(eventData1.updateApplied).to.be.true;

    const update = await mockRiskOracle.getLatestUpdateByParameterAndMarket(parameter, market);
    expect(await dataStore.getBool(keys.syncConfigUpdateCompletedKey(update.updateId))).to.be.true;
    expect(await dataStore.getUint(keys.syncConfigLatestUpdateIdKey())).to.equal(update.updateId);

    const [baseKey, data] = ethers.utils.defaultAbiCoder.decode(["bytes32", "bytes"], update.additionalData);
    const fullKey = getFullKey(baseKey, data);
    expect(await dataStore.getUint(fullKey)).to.equal(update.newValue);

    const markets = Array(parametersList.length).fill(ethUsdMarket.marketToken);
    const parameters: string[] = [];
    for (let i = (parametersList.length - 1); i >= 0; i--) {
      parameters.push(parametersList[i].parameterName);
    }
    
    let latestUpdateId = await dataStore.getUint(keys.syncConfigLatestUpdateIdKey());

    const tx2 = await configSyncer.connect(user1).sync(markets, parameters);
    const receipt2 = await tx2.wait(); 
    const parsedEventLogs2 = parseLogs(fixture, receipt2).filter(log => log.parsedEventInfo.eventName === "SyncConfig");
    const eventData2 = parsedEventLogs2[parameters.length - 2].parsedEventData;
    const eventData3 = parsedEventLogs2[parameters.length - 1].parsedEventData;
    expect(parsedEventLogs2.length).to.equal(5);
    expect(eventData2.updateApplied).to.be.false;
    expect(eventData3.updateApplied).to.be.true;
    
    // Not sure if the additional validation needs to be repeated here
    for (let i = 0; i < parameters.length; i++) {
      const update = await mockRiskOracle.getLatestUpdateByParameterAndMarket(parameters[i], markets[i]);
      expect(await dataStore.getBool(keys.syncConfigUpdateCompletedKey(update.updateId))).to.be.true;
      
      if (update.updateId > latestUpdateId) {
        latestUpdateId = update.updateId;
      }

      if (i === (parameters.length - 1)) {
        expect(await dataStore.getUint(keys.syncConfigLatestUpdateIdKey())).to.equal(latestUpdateId);
      }
      
      const [baseKey, data] = ethers.utils.defaultAbiCoder.decode(["bytes32", "bytes"], update.additionalData);
      const fullKey = getFullKey(baseKey, data);
      expect(await dataStore.getUint(fullKey)).to.equal(update.newValue);
    }
  });

  it("reverts when updates for a market are disabled", async () => {
    const market = ethUsdMarket.marketToken;
    const parameter = parametersList[0].parameterName;

    await dataStore.connect(user2).setBool(keys.syncConfigMarketDisabledKey(market), true);
    
    await expect(
      configSyncer.connect(user1).sync([market], [parameter])
    ).to.be.revertedWithCustomError(errorsContract, "SyncConfigUpdatesDisabledForMarket");
  });

  it("reverts when updates for a parameter are disabled", async () => {
    const market = ethUsdMarket.marketToken;
    const parameter = parametersList[0].parameterName;

    await dataStore.connect(user2).setBool(keys.syncConfigParameterDisabledKey(parameter), true);

    await expect(
      configSyncer.connect(user1).sync([market], [parameter])
    ).to.be.revertedWithCustomError(errorsContract, "SyncConfigUpdatesDisabledForParameter");
  });

  it("reverts when updates for a market parameter are disabled", async () => {
    const market = ethUsdMarket.marketToken;
    const parameter = parametersList[0].parameterName;

    await dataStore.connect(user2).setBool(keys.syncConfigMarketParameterDisabledKey(market, parameter), true);

    await expect(
      configSyncer.connect(user1).sync([market], [parameter])
    ).to.be.revertedWithCustomError(errorsContract, "SyncConfigUpdatesDisabledForMarketParameter");
  });

  it("reverts when the SyncConfig feature is disabled", async () => {
    const market = ethUsdMarket.marketToken;
    const parameter = parametersList[0].parameterName;

    await dataStore.connect(user2).setBool(keys.syncConfigFeatureDisabledKey(configSyncer.address), true);

    await expect(
      configSyncer.connect(user1).sync([market], [parameter])
    ).to.be.revertedWithCustomError(errorsContract, "DisabledFeature");
  });

  it("reverts when a parameter's baseKey is not whitelisted", async () => {
    const market = ethUsdMarket.marketToken;
    const parameter = maxPnlFactorForTradersLongs.parameterName;
    
    const referenceId = "NotApplicable";
    const newValue = ethers.utils.hexValue(2000000);
    const data = getDataForKey(maxPnlFactorForTradersLongs, ethUsdMarket.marketToken, ethUsdMarket.longToken, ethUsdMarket.shortToken);
    const additionalData = encodeData(["bytes32", "bytes"], [maxPnlFactorForTradersLongs.baseKey, data]);
    await mockRiskOracle.connect(wallet).publishRiskParameterUpdate(referenceId, newValue, parameter, market, additionalData);

    await expect(
      configSyncer.connect(user1).sync([market], [parameter])
    ).to.be.revertedWithCustomError(errorsContract, "InvalidBaseKey");
  });
});
