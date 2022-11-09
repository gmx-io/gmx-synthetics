const func = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("GasUtils", {
    from: deployer,
    log: true,
  });
};
func.tags = ["GasUtils"];
export default func;
