import { HardhatRuntimeEnvironment } from "hardhat/types";

export const EXISTING_MAINNET_DEPLOYMENTS = ["arbitrum", "avalanche"];

export function isExistingMainnetDeployment(hre: HardhatRuntimeEnvironment) {
  return EXISTING_MAINNET_DEPLOYMENTS.includes(hre.network.name);
}
