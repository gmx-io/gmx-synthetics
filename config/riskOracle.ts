import { HardhatRuntimeEnvironment } from "hardhat/types";

export default async function (hre: HardhatRuntimeEnvironment): Promise<string | undefined> {
  const network = hre.network.name;

  const config: { [network: string]: { riskOracleConfig?: string } } = {
    arbitrum: {
      riskOracleConfig: "0xd7042642Dd2DE0D7B9e9972Aa4cDfb23FBe9eBaD", // Not yet deployed to arbitrum, using Arbitrum Sepolia address as a placeholder
    },
    avalanche: {
      riskOracleConfig: "0xd7042642Dd2DE0D7B9e9972Aa4cDfb23FBe9eBaD", // Not yet deployed to avalanche, using Arbitrum Sepolia address as a placeholder
    },
    avalancheFuji: {
      riskOracleConfig: "0x2BBF5807b765e8A299C3C5B9044dB66c583c5595",
    },
    arbitrumSepolia: {
      riskOracleConfig: "0xd7042642Dd2DE0D7B9e9972Aa4cDfb23FBe9eBaD",
    },
  };

  return config[network]?.riskOracleConfig;
}
