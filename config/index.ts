import _ from "lodash";

import { extendEnvironment } from "hardhat/config";

import tokensConfig from "./tokens";
import marketsConfig from "./markets";
import oracleConfig from "./oracle";
import generalConfig from "./general";
import rolesConfig from "./roles";
import { HardhatRuntimeEnvironment } from "hardhat/types";

extendEnvironment(async (hre: HardhatRuntimeEnvironment) => {
  // extend hre context with gmx domain data

  hre.gmx = {
    getTokens: _.memoize(async () => tokensConfig(hre)),
    getOracle: _.memoize(async () => oracleConfig(hre)),
    getMarkets: _.memoize(async () => marketsConfig(hre)),
    getGeneral: _.memoize(async () => generalConfig(hre)),
    getRoles: _.memoize(async () => rolesConfig(hre)),
  };
});
