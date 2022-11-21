import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments, gmx }: HardhatRuntimeEnvironment) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const { oracle: oracleConfig } = gmx;

  for (const [tokenSymbol, { priceFeed }] of Object.entries(oracleConfig.tokens)) {
    if (!priceFeed || !priceFeed.deploy) {
      continue;
    }

    const { address } = await deploy(`${tokenSymbol}PriceFeed`, {
      from: deployer,
      log: true,
      contract: "MockPriceFeed",
    });
    priceFeed.address = address;
  }
};

func.skip = async ({ network }) => {
  // we only need deploy tokens for test networks
  return network.live;
};
func.dependencies = ["Tokens", "DataStore"];
func.tags = ["PriceFeeds"];
export default func;
