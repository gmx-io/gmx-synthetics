import { HardhatRuntimeEnvironment } from "hardhat/types";

export type FeeDistributorConfig = {
  feeDistributor?: string;
  gmx?: string;
  wnt?: string;
};

export default async function (hre: HardhatRuntimeEnvironment): Promise<FeeDistributorConfig> {
  const config: { [network: string]: FeeDistributorConfig } = {
    hardhat: {},
    arbitrum: {
      gmx: "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a",
      wnt: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    },
    avalanche: {
      gmx: "0x62edc0692BD897D2295872a9FFCac5425011c661",
      wnt: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
    },
    avalancheFuji: {
      gmx: "To be added",
      wnt: "To be added",
    },
    arbitrumSepolia: {
      gmx: "To be added",
      wnt: "To be added",
    },
  };

  const feeDistributorConfig: FeeDistributorConfig = config[hre.network.name];

  return feeDistributorConfig;
}
