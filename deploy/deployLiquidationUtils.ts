import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("LiquidationUtils", {
    from: deployer,
    log: true,
  });
};
func.tags = ["LiquidationUtils"];
export default func;
