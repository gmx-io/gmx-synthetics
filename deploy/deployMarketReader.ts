import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("MarketReader", {
    from: deployer,
    log: true,
  });
};
func.tags = ["MarketReader"];
export default func;
