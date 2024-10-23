import _ from "lodash";

import { extendEnvironment } from "hardhat/config";

import tokensConfig from "./tokens";
import marketsConfig from "./markets";
import glvsConfig from "./glvs";
import oracleConfig from "./oracle";
import generalConfig from "./general";
import buybackConfig from "./buyback";
import rolesConfig from "./roles";
import riskOracleConfig from "./riskOracle";
import vaultV1Config from "./vaultV1";
import { HardhatRuntimeEnvironment } from "hardhat/types";

extendEnvironment(async (hre: HardhatRuntimeEnvironment) => {
  // extend hre context with gmx domain data

  hre.gmx = {
    getTokens: _.memoize(async () => tokensConfig(hre)),
    getOracle: _.memoize(async () => oracleConfig(hre)),
    getMarkets: _.memoize(async () => marketsConfig(hre)),
    getGlvs: _.memoize(async () => glvsConfig(hre)),
    getGeneral: _.memoize(async () => generalConfig(hre)),
    getBuyback: _.memoize(async () => buybackConfig(hre)),
    getRoles: _.memoize(async () => rolesConfig(hre)),
    getRiskOracle: _.memoize(async () => riskOracleConfig(hre)),
    getVaultV1: _.memoize(async () => vaultV1Config(hre)),
  };
});
