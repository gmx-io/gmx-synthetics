import { HardhatRuntimeEnvironment } from "hardhat/types";

export default async function (hre: HardhatRuntimeEnvironment): Promise<string | undefined> {
  const network = hre.network.name;

  const config: { [network: string]: { riskOracleConfig?: string } } = {
    arbitrum: {
      riskOracleConfig: "0x48b67764dBB6B8fc2A0c3987ed3819e543212Bc3", // Not yet deployed to arbitrum, using Arbitrum Sepolia address as a placeholder
    },
    avalanche: {
      riskOracleConfig: "0x48b67764dBB6B8fc2A0c3987ed3819e543212Bc3", // Not yet deployed to avalanche, using Arbitrum Sepolia address as a placeholder
    },
    avalancheFuji: {
      riskOracleConfig: "0xE05354F4187820bF0832bF1f5fAd6a0F592b8fB6",
    },
    arbitrumSepolia: {
      riskOracleConfig: "0x48b67764dBB6B8fc2A0c3987ed3819e543212Bc3",
    },
  };

  return config[network]?.riskOracleConfig;
}
