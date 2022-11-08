const { ethers } = require("hardhat")
const { hashData } = require("../utils/hash")
const { decimalToFloat } = require("../utils/math")

const func = async ({
  getNamedAccounts,
  deployments,
  gmx,
}) => {
  const { execute, read, log } = deployments
  const { deployer } = await getNamedAccounts()
  const { tokens, markets } = gmx

  for (const marketConfig of markets) {
    const [indexToken, longToken, shortToken] = marketConfig.tokens.map(symbol => tokens[symbol].address)

    const marketToken = await read("MarketStore", { from: deployer, log: true }, "getMarketToken", indexToken, longToken, shortToken)
    if (marketToken !== ethers.constants.AddressZero) {
      log("market %s already exists at %s", marketConfig.tokens.join(":"), marketToken)
      continue
    }

    log("creating market %s", marketConfig.tokens.join(":"))
    await execute(
      "MarketFactory",
      { from: deployer, log: true },
      "createMarket",
      indexToken,
      longToken,
      shortToken,
    )
  }

  async function setReserveFactor(marketToken, isLong, reserveFactor) {
    const key = hashData(["string", "address", "bool"], ["RESERVE_FACTOR", marketToken, isLong], reserveFactor)
    const currentReservedFactor = await read("DataStore", { from: deployer, log: true }, "getUint", key)
    if (currentReservedFactor.eq(reserveFactor)) {
      log("reserve factor for %s %s already set %s", marketToken, isLong ? "long" : "short", reserveFactor)
      return
    }
    log("set market %s %s reserve factor %s", marketToken, isLong ? "long" : "short", reserveFactor.toString())
    await execute("DataStore", { from: deployer, log: true }, "setUint", key, reserveFactor)
  }

  for (const marketConfig of markets) {
    const [indexToken, longToken, shortToken] = marketConfig.tokens.map(symbol => tokens[symbol].address)
    const reserveFactor = decimalToFloat(marketConfig.reserveFactor[0], marketConfig.reserveFactor[1])

    const marketToken = await read("MarketStore", { from: deployer, log: true }, "getMarketToken", indexToken, longToken, shortToken)
    await setReserveFactor(marketToken, true, reserveFactor)
    await setReserveFactor(marketToken, false, reserveFactor)
  }
}

func.skip = async ({ gmx, network }) => {
  // skip if no markets configured
  if (!gmx.markets || gmx.markets.length === 0) {
    console.warn("no markets configured for network %s", network.name)
    return true
  }
  return false
}
func.tags = ["Markets"]
func.dependencies = ["MarketFactory", "Tokens", "DataStore"]
module.exports = func
