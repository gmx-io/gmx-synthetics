import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("OrderUtils", {
    from: deployer,
    log: true,
  });
};
func.tags = ["OrderUtils"];
export default func;
