const func = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("IncreasePositionUtils", {
    from: deployer,
    log: true,
  });
};
func.tags = ["IncreasePositionUtils"];
export default func;
