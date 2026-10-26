import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getConfigNetworkName } from "../utils/incentive";

export type IncentiveVesterParams = {
  name: string;
  symbol: string;
  vestingDuration: number;
  pairRatio: number;
};

export type IncentiveConfig = {
  seasonVester?: IncentiveVesterParams;
  orphanVester?: IncentiveVesterParams;
  referralVester?: string;
};

const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

export default async function (hre: HardhatRuntimeEnvironment): Promise<IncentiveConfig> {
  const config: { [network: string]: IncentiveConfig } = {
    hardhat: {
      seasonVester: { name: "Vested GMX S1", symbol: "vGMX-S1", vestingDuration: SECONDS_PER_YEAR, pairRatio: 5 },
      orphanVester: { name: "Vested GMX Orphan", symbol: "vGMX-O", vestingDuration: SECONDS_PER_YEAR, pairRatio: 5 },
      // arbitrum address for fork tests
      referralVester: "0x7c100c0F55A15221A4c1C5a25Db8C98A81df49B2",
    },
    arbitrum: {
      seasonVester: { name: "Vested GMX S1", symbol: "vGMX-S1", vestingDuration: SECONDS_PER_YEAR, pairRatio: 5 },
      orphanVester: { name: "Vested GMX Orphan", symbol: "vGMX-O", vestingDuration: SECONDS_PER_YEAR, pairRatio: 5 },
      referralVester: "0x7c100c0F55A15221A4c1C5a25Db8C98A81df49B2",
    },
    arbitrumSepolia: {
      seasonVester: { name: "Vested GMX S1", symbol: "vGMX-S1", vestingDuration: SECONDS_PER_YEAR, pairRatio: 5 },
      orphanVester: { name: "Vested GMX Orphan", symbol: "vGMX-O", vestingDuration: SECONDS_PER_YEAR, pairRatio: 5 },
    },
    avalanche: {
      seasonVester: { name: "Vested GMX S1", symbol: "vGMX-S1", vestingDuration: SECONDS_PER_YEAR, pairRatio: 5 },
      orphanVester: { name: "Vested GMX Orphan", symbol: "vGMX-O", vestingDuration: SECONDS_PER_YEAR, pairRatio: 5 },
      referralVester: "0x754eC029EF9926184b4CFDeA7756FbBAE7f326f7",
    },
    avalancheFuji: {
      seasonVester: { name: "Vested GMX S1", symbol: "vGMX-S1", vestingDuration: SECONDS_PER_YEAR, pairRatio: 5 },
      orphanVester: { name: "Vested GMX Orphan", symbol: "vGMX-O", vestingDuration: SECONDS_PER_YEAR, pairRatio: 5 },
    },
  };

  return config[getConfigNetworkName(hre)] || {};
}
