import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("OrderEventUtils", {
    from: deployer,
    log: true,
  });
};
func.tags = ["OrderEventUtils"];
export default func;
