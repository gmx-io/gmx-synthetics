const func = async ({
  getNamedAccounts,
  deployments,
}) => {
  const { deploy, get, execute } = deployments
  const { deployer } = await getNamedAccounts()

  const { address: roleStoreAddress } = await get("RoleStore");
  const { address: oracleStoreAddress } = await get("OracleStore");

  const { address } = await deploy("Oracle", {
    from: deployer,
    log: true,
    args: [roleStoreAddress, oracleStoreAddress]
  })

  await execute("RoleStore", { from: deployer, log: true }, "grantRole", address, ethers.utils.id("CONTROLLER"))
}
func.tags = ["Oracle"]
func.dependencies = ["RoleStore", "OracleStore"]
module.exports = func
