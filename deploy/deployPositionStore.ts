const func = async ({ getNamedAccounts, deployments }) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const roleStore = await get("RoleStore");

  await deploy("PositionStore", {
    from: deployer,
    log: true,
    args: [roleStore.address],
  });
};
func.tags = ["PositionStore"];
func.dependencies = ["RoleStore"];
export default func;
