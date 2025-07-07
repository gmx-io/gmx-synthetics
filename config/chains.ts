import { HardhatRuntimeEnvironment } from "hardhat/types";

const EXISTING_MAINNET_DEPLOYMENTS = ["arbitrum", "avalanche", "botanix"];

export function isExistingMainnetDeployment(hre: HardhatRuntimeEnvironment) {
  return EXISTING_MAINNET_DEPLOYMENTS.includes(hre.network.name);
}
