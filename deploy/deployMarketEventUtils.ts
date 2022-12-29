import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("MarketEventUtils", {
    from: deployer,
    log: true,
  });
};
func.tags = ["MarketEventUtils"];
export default func;
