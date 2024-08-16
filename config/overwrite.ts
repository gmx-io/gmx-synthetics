export function getExistingContractAddresses(network) {
  if (network.name === "arbitrum") {
    return {
      ReferralStorage: { address: "0xe6fab3f0c7199b0d34d7fbe83394fc0e0d06e99d" },
      RiskOracle: { address: "0x526d6789fCb503F2F898f45912A7a24fe9dd48e4" }, // Not yet deployed to arbitrum, using Arbitrum Sepolia address as a placeholder
    };
  }

  if (network.name === "avalanche") {
    return {
      ReferralStorage: { address: "0x827ed045002ecdabeb6e2b0d1604cf5fc3d322f8" },
      RiskOracle: { address: "0x526d6789fCb503F2F898f45912A7a24fe9dd48e4" }, // Not yet deployed to avalanche, using Arbitrum Sepolia address as a placeholder
    };
  }

  if (network.name === "avalancheFuji") {
    return {
      RiskOracle: { address: "0x526d6789fCb503F2F898f45912A7a24fe9dd48e4" }, // Not yet deployed to avalancheFugi, using Arbitrum Sepolia address as a placeholder
    };
  }

  if (network.name === "arbitrumSepolia") {
    return {
      RiskOracle: { address: "0x526d6789fCb503F2F898f45912A7a24fe9dd48e4" },
    };
  }

  return {};
}
