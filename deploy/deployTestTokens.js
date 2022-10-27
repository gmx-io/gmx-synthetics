const func = async ({
  getNamedAccounts,
  deployments,
  network
}) => {
  const { deploy } = deployments
  const { deployer } = await getNamedAccounts()

  const { address: wethAddress } = await deploy("WETH", {
    from: deployer,
    log: true
  })
  network.config.tokens.WETH.address = wethAddress

  for (const tokenSymbol of Object.keys(network.config.tokens)) {
    if (tokenSymbol === "WETH") {
      continue
    }
    const { address } = await deploy(tokenSymbol, {
      from: deployer,
      log: true,
      contract: "MintableToken"
    })
    network.config.tokens[tokenSymbol].address = address
  }
}

func.skip = async ({ network }) => {
  // we only need deploy tokens for test networks
  return network.live
}
func.tags = ["Tokens"]
module.exports = func
