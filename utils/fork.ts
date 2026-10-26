import hre from "hardhat";

// switches the in-process hardhat network to a fork of a configured network at runtime, so
// fork tests need no hardhat.config changes; the chain id stays the local one
export async function forkNetwork(network: string, blockNumber?: number): Promise<void> {
  const url = (hre.config.networks as any)[network]?.url;
  if (!url) {
    throw new Error(`no rpc url configured for ${network}`);
  }
  process.env.HARDHAT_FORK = network;
  await hre.network.provider.request({
    method: "hardhat_reset",
    params: [{ forking: { jsonRpcUrl: url, blockNumber } }],
  });
}

export async function unforkNetwork(): Promise<void> {
  delete process.env.HARDHAT_FORK;
  await hre.network.provider.request({ method: "hardhat_reset", params: [] });
}
