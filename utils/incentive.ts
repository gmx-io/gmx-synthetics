import { HardhatRuntimeEnvironment } from "hardhat/types";

// every legacy address derives from the live RewardRouterV2's getters so the deploy
// scripts have nothing further to hardcode (mirrors scripts/incentive/lib.ts)
const LIVE_ROUTER_ABI = [
  "function weth() view returns (address)",
  "function gmx() view returns (address)",
  "function esGmx() view returns (address)",
  "function bnGmx() view returns (address)",
  "function glp() view returns (address)",
  "function stakedGmxTracker() view returns (address)",
  "function bonusGmxTracker() view returns (address)",
  "function extendedGmxTracker() view returns (address)",
  "function feeGmxTracker() view returns (address)",
  "function stakedGlpTracker() view returns (address)",
  "function feeGlpTracker() view returns (address)",
  "function gmxVester() view returns (address)",
  "function glpVester() view returns (address)",
  "function govToken() view returns (address)",
];

export type LegacyAddresses = {
  rewardRouterV2: string;
  weth: string;
  gmx: string;
  esGmx: string;
  bnGmx: string;
  glp: string;
  stakedGmxTracker: string;
  bonusGmxTracker: string;
  extendedGmxTracker: string;
  feeGmxTracker: string;
  stakedGlpTracker: string;
  feeGlpTracker: string;
  gmxVester: string;
  glpVester: string;
  govToken: string;
};

export async function getLegacyAddresses(hre: HardhatRuntimeEnvironment): Promise<LegacyAddresses> {
  const vaultV1 = await hre.gmx.getVaultV1();
  if (!vaultV1?.rewardRouterV2) {
    throw new Error(`no rewardRouterV2 configured for network ${hre.network.name}`);
  }
  const router = await hre.ethers.getContractAt(LIVE_ROUTER_ABI, vaultV1.rewardRouterV2);
  const [
    weth,
    gmx,
    esGmx,
    bnGmx,
    glp,
    stakedGmxTracker,
    bonusGmxTracker,
    extendedGmxTracker,
    feeGmxTracker,
    stakedGlpTracker,
    feeGlpTracker,
    gmxVester,
    glpVester,
    govToken,
  ] = await Promise.all([
    router.weth(),
    router.gmx(),
    router.esGmx(),
    router.bnGmx(),
    router.glp(),
    router.stakedGmxTracker(),
    router.bonusGmxTracker(),
    router.extendedGmxTracker(),
    router.feeGmxTracker(),
    router.stakedGlpTracker(),
    router.feeGlpTracker(),
    router.gmxVester(),
    router.glpVester(),
    router.govToken(),
  ]);
  return {
    rewardRouterV2: vaultV1.rewardRouterV2,
    weth,
    gmx,
    esGmx,
    bnGmx,
    glp,
    stakedGmxTracker,
    bonusGmxTracker,
    extendedGmxTracker,
    feeGmxTracker,
    stakedGlpTracker,
    feeGlpTracker,
    gmxVester,
    glpVester,
    govToken,
  };
}

const LIVE_ROUTER_CONFIG_ABI = [
  "function maxBoostBasisPoints() view returns (uint256)",
  "function inStrictTransferMode() view returns (bool)",
  "function votingPowerType() view returns (uint8)",
];

export type LegacyRouterConfig = {
  maxBoostBasisPoints: string;
  inStrictTransferMode: boolean;
  votingPowerType: number;
};

// RewardRouterV3 takes the live router's config at construction, so it never holds
// permissions under a config that differs from the router it replaces
export async function getLegacyRouterConfig(hre: HardhatRuntimeEnvironment): Promise<LegacyRouterConfig> {
  const vaultV1 = await hre.gmx.getVaultV1();
  if (!vaultV1?.rewardRouterV2) {
    throw new Error(`no rewardRouterV2 configured for network ${hre.network.name}`);
  }
  const router = await hre.ethers.getContractAt(LIVE_ROUTER_CONFIG_ABI, vaultV1.rewardRouterV2);
  const [maxBoostBasisPoints, inStrictTransferMode, votingPowerType] = await Promise.all([
    router.maxBoostBasisPoints(),
    router.inStrictTransferMode(),
    router.votingPowerType(),
  ]);
  return {
    maxBoostBasisPoints: maxBoostBasisPoints.toString(),
    inStrictTransferMode,
    votingPowerType,
  };
}

export const PAIR_RATIO_PRECISION = "1000000000000000000000000000000"; // 10^30, RatioVester.PAIR_RATIO_PRECISION

export const INCENTIVE_TESTNETS = ["arbitrumSepolia", "avalancheFuji"];

export const INCENTIVE_MOCK_TOKEN_NAMES = {
  esGmx: "IncentiveEsGmx",
  pairToken: "IncentivePairToken",
  claimableToken: "IncentiveClaimableToken",
} as const;

export type IncentiveTokenAddresses = {
  esGmx: string;
  pairToken: string;
  claimableToken: string;
};

// on a fork the local network keeps its own name, so config lookups follow the forked network
export function getConfigNetworkName(hre: HardhatRuntimeEnvironment): string {
  const fork = process.env.HARDHAT_FORK;
  if (fork && ["hardhat", "localhost"].includes(hre.network.name)) {
    return fork;
  }
  return hre.network.name;
}

export function isIncentiveTestnet(hre: HardhatRuntimeEnvironment): boolean {
  return INCENTIVE_TESTNETS.includes(getConfigNetworkName(hre));
}

// testnets always deploy the issuer, vesters, and mock tokens; mainnet still requires
// INCENTIVE_DEPLOY so a routine full deploy never ships these on arbitrum or avalanche.
// The standard hardhat fixture is unaffected.
export async function skipIncentiveDeploy(hre: HardhatRuntimeEnvironment): Promise<boolean> {
  if (isIncentiveTestnet(hre)) {
    return false;
  }
  if (!process.env.INCENTIVE_DEPLOY) {
    return true;
  }
  return !["arbitrum", "avalanche"].includes(getConfigNetworkName(hre));
}

// RewardRouterV3 and the cap zeroers read live V1 contracts, which do not exist on testnets
export async function skipIncentiveLegacyDeploy(hre: HardhatRuntimeEnvironment): Promise<boolean> {
  if (isIncentiveTestnet(hre)) {
    return true;
  }
  return skipIncentiveDeploy(hre);
}

export async function skipIncentiveMockTokens(hre: HardhatRuntimeEnvironment): Promise<boolean> {
  return !isIncentiveTestnet(hre);
}

export async function getIncentiveTokenAddresses(hre: HardhatRuntimeEnvironment): Promise<IncentiveTokenAddresses> {
  if (isIncentiveTestnet(hre)) {
    const { get } = hre.deployments;
    const [esGmx, pairToken, claimableToken] = await Promise.all([
      get(INCENTIVE_MOCK_TOKEN_NAMES.esGmx),
      get(INCENTIVE_MOCK_TOKEN_NAMES.pairToken),
      get(INCENTIVE_MOCK_TOKEN_NAMES.claimableToken),
    ]);
    return {
      esGmx: esGmx.address,
      pairToken: pairToken.address,
      claimableToken: claimableToken.address,
    };
  }

  const legacy = await getLegacyAddresses(hre);
  return {
    esGmx: legacy.esGmx,
    pairToken: legacy.feeGmxTracker,
    claimableToken: legacy.gmx,
  };
}
