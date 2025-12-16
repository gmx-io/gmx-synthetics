// Shared contract addresses and configurations for GMX LayerZero verification scripts
// Addresses are manually maintained - OFTAdapter/OFT deployments happen in a separate LZ team repo

// =============================================================================
// Types
// =============================================================================

export type NetworkName = "arbitrum" | "ethereum" | "base" | "bsc" | "bera" | "botanix";

export interface NetworkConfig {
  eid: number;
  endpoint: string;
  owner: string;
}

export interface UniformGmContract {
  address: string;
  underlying: string;
}

export interface PerNetworkGmContract {
  underlying: string;
  perNetwork: Record<NetworkName, string>;
}

export interface GlvContract {
  underlying: string;
  perNetwork: Record<NetworkName, string>;
}

// =============================================================================
// Network Configuration
// =============================================================================

const LZ_ENDPOINT_STANDARD = "0x1a44076050125825900e736c501f859c50fE728c";
const LZ_ENDPOINT_ALT = "0x6F475642a6e85809B1c36Fa62763669b1b48DD5B"; // Bera, Botanix

const STANDARD_MULTISIG = "0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D";
const BOTANIX_MULTISIG = "0x656fa39BdB5984b477FA6aB443195D72D1Accc1c";

export const networks: Record<NetworkName, NetworkConfig> = {
  arbitrum: {
    eid: 30110,
    endpoint: LZ_ENDPOINT_STANDARD,
    owner: STANDARD_MULTISIG,
  },
  ethereum: {
    eid: 30101,
    endpoint: LZ_ENDPOINT_STANDARD,
    owner: STANDARD_MULTISIG,
  },
  base: {
    eid: 30184,
    endpoint: LZ_ENDPOINT_STANDARD,
    owner: STANDARD_MULTISIG,
  },
  bsc: {
    eid: 30102,
    endpoint: LZ_ENDPOINT_STANDARD,
    owner: STANDARD_MULTISIG,
  },
  bera: {
    eid: 30362,
    endpoint: LZ_ENDPOINT_ALT,
    owner: STANDARD_MULTISIG,
  },
  botanix: {
    eid: 30376,
    endpoint: LZ_ENDPOINT_ALT,
    owner: BOTANIX_MULTISIG,
  },
};

export const allNetworks: NetworkName[] = ["arbitrum", "ethereum", "base", "bsc", "bera", "botanix"];
export const expansionNetworks: NetworkName[] = ["ethereum", "base", "bsc", "bera", "botanix"];

// =============================================================================
// GM Contract Addresses
// =============================================================================

// GM WETH-USDC (same address on all networks)
export const gmWethUsdc: UniformGmContract = {
  address: "0xfcff5015627B8ce9CeAA7F5b38a6679F65fE39a7",
  underlying: "0x70d95587d40a2caf56bd97485ab3eec10bee6336",
};

// GM WBTC-USDC (same address on all networks)
export const gmWbtcUsdc: UniformGmContract = {
  address: "0x91dd54AA8BA9Dfde8b956Cfb709a7c418f870e21",
  underlying: "0x47c031236e19d024b42f8ae6780e44a573170703",
};

// GM BTC-BTC (different per network)
export const gmBtcBtc: PerNetworkGmContract = {
  underlying: "0x7C11F78Ce78768518D743E81Fdfa2F860C6b9A77",
  perNetwork: {
    arbitrum: "0x661E1faD17124471a59c37E9c4590BA809599f30", // Adapter
    ethereum: "0x5Ece4d3F43D3BD8cBffc1d2CE851E7605D403D3C", // OFT
    base: "0x5E922D32c7278f6c5621a016c03055c54C97D27b", // OFT
    bsc: "0x2e6Bf9Bdd2A7872bDae170C13F34d64692f842C1", // OFT
    bera: "0xa2d2e356c64dE9b0a5b4CFDfF2B4c82C0eC3D7A2", // OFT
    botanix: "0x9717D91D6943546A990Ae509a46655BA4Ad57649", // OFT
  },
};

// GM WETH-WETH (different per network)
export const gmWethWeth: PerNetworkGmContract = {
  underlying: "0x450bb6774Dd8a756274E0ab4107953259d2ac541",
  perNetwork: {
    arbitrum: "0x0110424A21D5DF818f4a789E5d9d9141a4E29A3C", // Adapter
    ethereum: "0x0B335e18Ab68Ccd2E8946A6E785D8bE65F413103", // OFT
    base: "0x47dFf0cbE239c02479C5944b9F4F3Ade8a212457", // OFT
    bsc: "0x5Ece4d3F43D3BD8cBffc1d2CE851E7605D403D3C", // OFT
    bera: "0x2e6Bf9Bdd2A7872bDae170C13F34d64692f842C1", // OFT
    botanix: "0x9f260cf66B3240e75C1bEe51a65936b513618159", // OFT
  },
};

// =============================================================================
// GLV Contract Addresses
// =============================================================================

// GLV WETH-USDC (different per network)
export const glvWethUsdc: GlvContract = {
  underlying: "0x528A5bac7E746C9A509A1f4F6dF58A03d44279F9",
  perNetwork: {
    arbitrum: "0x8c92eaE643040fF0Fb65B423433001c176cB0bb6", // Adapter
    ethereum: "0x0BC5aB50Fd581b34681A9be180179b1Ef0b238c7", // OFT
    base: "0x8c92eaE643040fF0Fb65B423433001c176cB0bb6", // OFT
    bsc: "0x0BC5aB50Fd581b34681A9be180179b1Ef0b238c7", // OFT
    bera: "0x8c92eaE643040fF0Fb65B423433001c176cB0bb6", // OFT
    botanix: "0x8c92eaE643040fF0Fb65B423433001c176cB0bb6", // OFT
  },
};

// GLV WBTC-USDC (different per network)
export const glvWbtcUsdc: GlvContract = {
  underlying: "0xdF03EEd325b82bC1d4Db8b49c30ecc9E05104b96",
  perNetwork: {
    arbitrum: "0x27Ef981E6fcB274a6C5C75983725d265Fd3dCdac", // Adapter
    ethereum: "0x3c21894169D669C5f0767c1289E71Ec8d6132C0F", // OFT
    base: "0xbCB170fEDDa90cd7593f016DFdabA032Ca1F222b", // OFT
    bsc: "0x3c21894169D669C5f0767c1289E71Ec8d6132C0F", // OFT
    bera: "0xbCB170fEDDa90cd7593f016DFdabA032Ca1F222b", // OFT
    botanix: "0xbCB170fEDDa90cd7593f016DFdabA032Ca1F222b", // OFT
  },
};

// =============================================================================
// DVN Addresses (lowercase for comparison)
// =============================================================================

export const dvnAddresses = {
  layerzero: "0x2f55c492897526677c5b68fb199ea31e2c126416",
  canary: "0xf2e380c90e6c09721297526dbc74f870e114dfcb",
  horizen: "0x19670df5e16bea2ba9b9e68b48c054c5baea06b8",
  deutsche: "0xeae839784e5f6c79bbaf34b6023a2f62e134ab39",
};

// =============================================================================
// LayerZero Infrastructure
// =============================================================================

export const sendLib = "0x975bcd720be66659e3eb3c0e4f1866a3020e493a"; // Arbitrum Send Library

// =============================================================================
// Helper Functions
// =============================================================================

export function getNetworkConfig(network: NetworkName): NetworkConfig {
  return networks[network];
}

export function getGmContract(market: string, network: NetworkName): string {
  switch (market) {
    case "WETH_USDC":
      return gmWethUsdc.address;
    case "WBTC_USDC":
      return gmWbtcUsdc.address;
    case "BTC_BTC":
      return gmBtcBtc.perNetwork[network];
    case "WETH_WETH":
      return gmWethWeth.perNetwork[network];
    default:
      throw new Error(`Unknown GM market: ${market}`);
  }
}

export function getGlvContract(market: string, network: NetworkName): string {
  switch (market) {
    case "WETH_USDC":
      return glvWethUsdc.perNetwork[network];
    case "WBTC_USDC":
      return glvWbtcUsdc.perNetwork[network];
    default:
      throw new Error(`Unknown GLV market: ${market}`);
  }
}

export function getExpectedOwner(network: NetworkName): string {
  return networks[network].owner;
}

export function isUniformAddress(market: string): boolean {
  return market === "WETH_USDC" || market === "WBTC_USDC";
}

// All GM markets for iteration
export const gmMarkets = ["WETH_USDC", "WBTC_USDC", "BTC_BTC", "WETH_WETH"] as const;
export const glvMarkets = ["WETH_USDC", "WBTC_USDC"] as const;

// Get underlying token address for a market
export function getGmUnderlying(market: string): string {
  switch (market) {
    case "WETH_USDC":
      return gmWethUsdc.underlying;
    case "WBTC_USDC":
      return gmWbtcUsdc.underlying;
    case "BTC_BTC":
      return gmBtcBtc.underlying;
    case "WETH_WETH":
      return gmWethWeth.underlying;
    default:
      throw new Error(`Unknown GM market: ${market}`);
  }
}

export function getGlvUnderlying(market: string): string {
  switch (market) {
    case "WETH_USDC":
      return glvWethUsdc.underlying;
    case "WBTC_USDC":
      return glvWbtcUsdc.underlying;
    default:
      throw new Error(`Unknown GLV market: ${market}`);
  }
}
