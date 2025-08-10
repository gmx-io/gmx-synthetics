import { HardhatRuntimeEnvironment } from "hardhat/types";
import { expandDecimals } from "../utils/math";

const func = async (hre: HardhatRuntimeEnvironment) => {
  const { getNamedAccounts, deployments, network } = hre;
  const { log } = deployments;
  const { deployer } = await getNamedAccounts();
  const balance = expandDecimals(1000, 18);
  log("set deployer %s balance to %s", deployer, balance);

  if (network.name === "hardhat") {
    const { setBalance } = await import("@nomicfoundation/hardhat-network-helpers");
    await setBalance(deployer, balance);
  } else if (network.name === "localhost") {
    log("Skipping balance setting for Anvil (accounts already funded)");
    // Anvil accounts are already funded with 10000 ETH by default
    // If needed, we could use anvil_setBalance RPC method here
  }
};

func.skip = async ({ network }) => {
  return network.live;
};
func.tags = ["FundAccounts"];
export default func;
