const func = async ({
  getNamedAccounts,
  deployments,
}) => {
  const { deploy, execute } = deployments
  const { deployer } = await getNamedAccounts()

  await deploy("RoleStore", {
    from: deployer,
    log: true,
  })

  await execute("RoleStore", { from: deployer, log: true }, "grantRole", deployer, ethers.utils.id("CONTROLLER"))
  await execute("RoleStore", { from: deployer, log: true }, "grantRole", deployer, ethers.utils.id("ORDER_KEEPER"))
}
func.tags = ["RoleStore"]
module.exports = func
