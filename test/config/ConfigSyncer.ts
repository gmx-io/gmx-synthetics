import { expect } from "chai";
import { deployFixture } from "../../utils/fixture";
import { grantRole } from "../../utils/role";
import { encodeData, hashString } from "../../utils/hash";
import { decimalToFloat, expandDecimals } from "../../utils/math";
import { errorsContract } from "../../utils/error";
import * as keys from "../../utils/keys";
import { getFullKey } from "../../utils/config";
import { parametersList, computeData } from "../../utils/configSyncer";
import { ethers } from "ethers";

describe("ConfigSyncer", () => {
    let fixture;
    let wallet, user0, user1;
    let configSyncer, config, dataStore, roleStore, eventEmitter, mockRiskOracle, ethUsdMarket;
    const { AddressZero } = ethers.constants;
  
    beforeEach(async () => {
      fixture = await deployFixture();
      ({ configSyncer, config, dataStore, roleStore, eventEmitter, mockRiskOracle, ethUsdMarket } = fixture.contracts);
      ({ wallet, user0, user1 } = fixture.accounts);

      await grantRole(roleStore, user0.address, "CONFIG_KEEPER");
      await grantRole(roleStore, user1.address, "LIMITED_CONFIG_KEEPER");
      
      const referenceIds = Array(parametersList.length).fill("NotApplicable");
      const newValues = Array(parametersList.length).fill(ethers.utils.hexValue(2000000));
      const updateTypes: string[] = [];
      const markets = Array(parametersList.length).fill(ethUsdMarket[0])
      const additionalData: string[] = [];
      for (let i = 0; i < parametersList.length; i++) {
        const data = computeData(parametersList[i], ethUsdMarket[0], ethUsdMarket[2], ethUsdMarket[3]);
        const encodedData = encodeData(["bytes32", "bytes"], [parametersList[i].baseKey, data]);
        updateTypes.push(parametersList[i].parameterName);
        additionalData.push(encodedData);

      }
      await mockRiskOracle.connect(wallet).publishBulkRiskParameterUpdates(referenceIds, newValues, updateTypes, markets, additionalData);
    });
  
    it("should interact correctly with MockRiskOracle", async () => {
      // Example test that interacts with MockRiskOracle
      const mockValue = await mockRiskOracle.isAuthorized(wallet.address);
      expect(mockValue).to.equal(true);
    });

    it("reverts when unauthorized access attempts to sync", async () => {
        const markets = [ethUsdMarket[0]];
        const parameters = [parametersList[0].parameterName];
    
        await expect(
          configSyncer.connect(user0).sync(markets, parameters)
        ).to.be.revertedWithCustomError(errorsContract, "Unauthorized");
    });

    it("allows LIMITED_CONFIG_KEEPER to sync a single update", async () => {
        const markets = [ethUsdMarket[0]];
        const parameters = [parametersList[0].parameterName];
        const update = await mockRiskOracle.getLatestUpdateByParameterAndMarket(parameters[0], markets[0]);
        
        await configSyncer.connect(user1).sync(markets, parameters);
        
        expect(await dataStore.getUint(keys.syncConfigLatestUpdateIdKey())).to.equal(update.updateId);
        expect(await dataStore.getBool(keys.syncConfigUpdateCompletedKey(update.updateId))).to.be.true;
        
        const [baseKey, data] = ethers.utils.defaultAbiCoder.decode(["bytes32", "bytes"], update.additionalData);
        const fullKey = getFullKey(baseKey, data);

        expect(await dataStore.getUint(fullKey)).to.equal(update.newValue);
    });
  });
