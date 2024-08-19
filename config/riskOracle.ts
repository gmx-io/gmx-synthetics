import { HardhatRuntimeEnvironment } from "hardhat/types";

export default async function (hre: HardhatRuntimeEnvironment): Promise<string | undefined> {
  const network = hre.network.name;

  const config: { [network: string]: { riskOracleConfig?: string } } = {
    arbitrum: {
      riskOracleConfig: "0x526d6789fCb503F2F898f45912A7a24fe9dd48e4", // Not yet deployed to arbitrum, using Arbitrum Sepolia address as a placeholder
    },
    avalanche: {
      riskOracleConfig: "0x526d6789fCb503F2F898f45912A7a24fe9dd48e4", // Not yet deployed to avalanche, using Arbitrum Sepolia address as a placeholder
    },
    avalancheFuji: {
      riskOracleConfig: "0x526d6789fCb503F2F898f45912A7a24fe9dd48e4", // Not yet deployed to avalancheFuji, using Arbitrum Sepolia address as a placeholder
    },
    arbitrumSepolia: {
      riskOracleConfig: "0x526d6789fCb503F2F898f45912A7a24fe9dd48e4",
    },
  };

  return config[network]?.riskOracleConfig;
}
