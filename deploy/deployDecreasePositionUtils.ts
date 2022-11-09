const func = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("DecreasePositionUtils", {
    from: deployer,
    log: true,
  });
};
func.tags = ["DecreasePositionUtils"];
export default func;
