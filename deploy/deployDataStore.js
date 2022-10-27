const { hashString } = require("../utils/hash")
const { expandFloatDecimals } = require("../utils/math");

const func = async ({
  getNamedAccounts,
  deployments,
}) => {
  const { deploy, execute, get } = deployments
  const { deployer } = await getNamedAccounts()

  const roleStore = await get("RoleStore");

  const result = await deploy("DataStore", {
    from: deployer,
    log: true,
    args: [roleStore.address]
  })

  async function setDataStoreUint(key, value) {
    await execute("DataStore", { from: deployer, log: true }, "setUint", hashString(key), value)
  }

  if (result.newlyDeployed) {
    await setDataStoreUint("MIN_ORACLE_BLOCK_CONFIRMATIONS", 100)
    await setDataStoreUint("MAX_ORACLE_BLOCK_AGE", 200)
    await setDataStoreUint("MAX_LEVERAGE", expandFloatDecimals(100))

    await execute("DataStore", { from: deployer, log: true }, "setAddress", hashString("WETH"), network.config.tokens.WETH.address)
  }
}
func.tags = ["DataStore"]
func.dependencies = ["RoleStore", "Tokens"]
module.exports = func
