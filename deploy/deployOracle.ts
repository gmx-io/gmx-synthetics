import { grantRoleIfNotGranted } from "../utils/role";
import { setUintIfDifferent } from "../utils/dataStore";
import * as keys from "../utils/keys";
import { createDeployFunction } from "../utils/deploy";

const constructorContracts = ["RoleStore", "DataStore", "EventEmitter"];

const func = createDeployFunction({
  contractName: "Oracle",
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts }) => {
    return constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address);
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
      "max oracle price age"
    );
    await setUintIfDifferent(
      keys.MAX_ORACLE_REF_PRICE_DEVIATION_FACTOR,
      oracleConfig.maxRefPriceDeviationFactor,
      "max ref price deviation factor"
    );

    // the Oracle contract requires the CONTROLLER to emit events
    await grantRoleIfNotGranted(deployedContract.address, "CONTROLLER", "oracle");
  },
  id: "Oracle_3",
});

func.dependencies = func.dependencies.concat(["Tokens", "MockDataStreamVerifier"]);

export default func;
