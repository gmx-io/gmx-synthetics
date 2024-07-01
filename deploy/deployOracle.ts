import { grantRoleIfNotGranted } from "../utils/role";
import { setUintIfDifferent, setAddressIfDifferent } from "../utils/dataStore";
import * as keys from "../utils/keys";
import { createDeployFunction } from "../utils/deploy";

const constructorContracts = ["RoleStore", "DataStore", "EventEmitter"];

const func = createDeployFunction({
  contractName: "Oracle",
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts, gmx }) => {
    const generalConfig = await gmx.getGeneral();
    return constructorContracts
      .map((dependencyName) => dependencyContracts[dependencyName].address)
      .concat(generalConfig.sequencerUptimeFeed);
  },
  afterDeploy: async ({ deployedContract, gmx }) => {
    const oracleConfig = await gmx.getOracle();
    await setUintIfDifferent(
      keys.MIN_ORACLE_BLOCK_CONFIRMATIONS,
      oracleConfig.minOracleBlockConfirmations,
      "min oracle block confirmations"
    );
    await setUintIfDifferent(keys.MAX_ORACLE_PRICE_AGE, oracleConfig.maxOraclePriceAge, "max oracle price age");
    await setUintIfDifferent(
      keys.MAX_ORACLE_TIMESTAMP_RANGE,
      oracleConfig.maxOracleTimestampRange,
      "max oracle timestamp range"
    );
    await setUintIfDifferent(
      keys.MAX_ORACLE_REF_PRICE_DEVIATION_FACTOR,
      oracleConfig.maxRefPriceDeviationFactor,
      "max ref price deviation factor"
    );
    await setAddressIfDifferent(
      keys.CHAINLINK_PAYMENT_TOKEN,
      oracleConfig.chainlinkPaymentToken,
      "chainlinkPaymentToken"
    );

    // the Oracle contract requires the CONTROLLER to emit events
    await grantRoleIfNotGranted(deployedContract.address, "CONTROLLER", "oracle");
  },
  id: "Oracle_4",
});

func.dependencies = func.dependencies.concat(["Tokens", "MockDataStreamVerifier", "ChainlinkPriceFeedProvider"]);

export default func;
