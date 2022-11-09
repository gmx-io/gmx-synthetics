const func = async ({ getNamedAccounts, deployments, gmx }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  const { tokens } = gmx;

  const { address: wethAddress } = await deploy("WETH", {
    from: deployer,
    log: true,
  });
  tokens.WETH.address = wethAddress;

  for (const tokenSymbol of Object.keys(tokens)) {
    const { address } = await deploy(tokenSymbol, {
      from: deployer,
      log: true,
      contract: "MintableToken",
    });
    tokens[tokenSymbol].address = address;
  }
};

func.skip = async ({ network }) => {
  // we only need deploy tokens for test networks
  return network.live;
};
func.tags = ["Tokens"];
export default func;
