import { HardhatRuntimeEnvironment } from "hardhat/types";

export type FeeDistributorConfig = {
  feeDistributor?: string;
};

export default async function (hre: HardhatRuntimeEnvironment): Promise<FeeDistributorConfig> {
  const config: { [network: string]: FeeDistributorConfig } = {
    hardhat: {},
    arbitrum: {
      gmx: "0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a",
      esGmx: "0xf42Ae1D54fd613C9bb14810b0588FaAa09a426cA",
      wnt: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    },
    avalanche: {
      gmx: "0x62edc0692BD897D2295872a9FFCac5425011c661",
      esGmx: "0xff1489227bbaac61a9209a08929e4c2a526ddd17",
      wnt: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
    },
    avalancheFuji: {
      gmx: "To be added",
      esGmx: "To be added",
      wnt: "To be added",
    },
    arbitrumSepolia: {
      gmx: "To be added",
      esGmx: "To be added",
      wnt: "To be added",
    },
  };

  const feeDistributorConfig: FeeDistributorConfig = config[hre.network.name];

  return feeDistributorConfig;
}
