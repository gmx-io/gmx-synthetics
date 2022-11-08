const func = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("FeeReceiver", {
    from: deployer,
    log: true,
  });
};
func.tags = ["FeeReceiver"];
export default func;
