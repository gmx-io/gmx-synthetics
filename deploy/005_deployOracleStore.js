const func = async ({
  getNamedAccounts,
  deployments,
}) => {
  const { deploy, get, execute } = deployments
  const { deployer, oracleSigner0 } = await getNamedAccounts()

  const roleStoreDeployment = await get("RoleStore");

  await deploy("OracleStore", {
    from: deployer,
    log: true,
    args: [roleStoreDeployment.address]
  })

  await execute("OracleStore", { from: deployer, log: true }, "addSigner", oracleSigner0)
}
func.tags = ["OracleStore"]
func.dependencies = ["RoleStore"]
module.exports = func
