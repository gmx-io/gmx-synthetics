const { expandFloatDecimals } = require("../utils/math");

const func = async ({
  getNamedAccounts,
  deployments,
}) => {
  const { deploy, execute, get } = deployments
  const { deployer } = await getNamedAccounts()

  const roleStore = await get("RoleStore");

  await deploy("DataStore", {
    from: deployer,
    log: true,
    args: [roleStore.address]
  })

  async function setDataStoreUint(key, value) {
    await execute("DataStore", { from: deployer, log: true }, "setUint", ethers.utils.id(key), value)
  }
  await setDataStoreUint("MIN_ORACLE_BLOCK_CONFIRMATIONS", 100)
  await setDataStoreUint("MAX_ORACLE_BLOCK_AGE", 200)
  await setDataStoreUint("MAX_LEVERAGE", expandFloatDecimals(100))
}
func.tags = ["DataStore"]
func.dependencies = ["RoleStore"]
module.exports = func
