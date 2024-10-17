import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments, gmx }: HardhatRuntimeEnvironment) => {
  const { deploy, execute } = deployments;
  const { deployer } = await getNamedAccounts();
  const tokens = await gmx.getTokens();

  for (const [tokenSymbol, { priceFeed }] of Object.entries(tokens)) {
    if (!priceFeed || !priceFeed.deploy) {
      continue;
    }

    const contractName = `${tokenSymbol}PriceFeed`;
    const { address } = await deploy(contractName, {
      from: deployer,
      log: true,
      contract: "MockPriceFeed",
    });
    priceFeed.address = address;

    await execute(contractName, { from: deployer, log: true }, "setAnswer", priceFeed.initPrice);
  }
};

func.dependencies = ["Tokens", "DataStore"];
func.tags = ["PriceFeeds"];
export default func;
