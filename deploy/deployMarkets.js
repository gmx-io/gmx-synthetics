const { ethers } = require("hardhat")
const { hashString, hashData } = require("../utils/hash")
const { decimalToFloat } = require("../utils/math")

function getMarketHash(indexToken, longToken, shortToken) {
  return hashString(`${indexToken}:${longToken}:${shortToken}`)
}

const func = async ({
  getNamedAccounts,
  deployments,
  network,
}) => {
  const { execute, read, log } = deployments
  const { deployer } = await getNamedAccounts()
  const { tokens } = network.config

  const marketsConfig = [
    [tokens.WETH.address, tokens.WETH.address, tokens.USDC.address, decimalToFloat(5, 1)],
  ]

  for (const [indexToken, longToken, shortToken] of marketsConfig) {
    const marketToken = await read("MarketStore", { from: deployer, log: true }, "getMarketToken", indexToken, longToken, shortToken)
    if (marketToken !== ethers.constants.AddressZero) {
      log("Market already exists %s %s %s", indexToken, longToken, shortToken)
      continue
    }

    log("creating market %s %s %s", indexToken, longToken, shortToken)
    await execute(
      "MarketFactory",
      { from: deployer, log: true },
      "createMarket",
      indexToken,
      longToken,
      shortToken,
    )
  }

  for (const [indexToken, longToken, shortToken, reserveFactor] of marketsConfig) {
    const marketToken = await read("MarketStore", { from: deployer, log: true }, "getMarketToken", indexToken, longToken, shortToken)
    log("set market reserve factor %s", reserveFactor.toString())
    await execute(
      "DataStore",
      { from: deployer, log: true },
      "setUint",
      hashData(["string", "address", "bool"], ["RESERVE_FACTOR", marketToken, true], reserveFactor),
      reserveFactor
    )
  }
}
func.tags = ["Markets"]
func.dependencies = ["MarketFactory", "Tokens"]
module.exports = func
