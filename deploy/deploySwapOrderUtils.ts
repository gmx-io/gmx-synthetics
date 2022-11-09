const func = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("SwapOrderUtils", {
    from: deployer,
    log: true,
  });
};
func.tags = ["SwapOrderUtils"];
export default func;
