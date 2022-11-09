const func = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("Reader", {
    from: deployer,
    log: true,
  });
};
func.tags = ["Reader"];
export default func;
