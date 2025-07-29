import { HardhatRuntimeEnvironment } from "hardhat/types";

export type ChainlinkFlagsConfig = {
  flags?: string;
};

export default async function (hre: HardhatRuntimeEnvironment): Promise<ChainlinkFlagsConfig> {
  const config: { [network: string]: ChainlinkFlagsConfig } = {
    hardhat: {},
    arbitrum: {
      flags: "0x20551B03c092D998b1410c47BD54004D7C3106D0",
    },
    avalanche: {
      flags: "0x71c5CC2aEB9Fa812CA360E9bAC7108FC23312cdd",
    },
    botanix: {
      flags: "0x0000000000000000000000000000000000000000",
    },
    avalancheFuji: {
      flags: "0x0000000000000000000000000000000000000000",
    },
    arbitrumSepolia: {
      flags: "0x0000000000000000000000000000000000000000",
    },
  };

  const chainlinkFlagsConfig: ChainlinkFlagsConfig = config[hre.network.name];

  return chainlinkFlagsConfig;
}
