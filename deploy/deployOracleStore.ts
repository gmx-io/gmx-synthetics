const func = async ({ getNamedAccounts, deployments }) => {
  const { deploy, get, execute } = deployments;
  const { deployer, oracleSigner0 } = await getNamedAccounts();

  const roleStoreDeployment = await get("RoleStore");

  const { newlyDeployed } = await deploy("OracleStore", {
    from: deployer,
    log: true,
    args: [roleStoreDeployment.address],
  });

  if (newlyDeployed) {
    await execute("OracleStore", { from: deployer, log: true }, "addSigner", oracleSigner0);
  }
};
func.tags = ["OracleStore"];
func.dependencies = ["RoleStore"];
export default func;
