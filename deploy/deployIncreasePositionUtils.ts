import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("IncreasePositionUtils", {
    from: deployer,
    log: true,
  });
};
func.tags = ["IncreasePositionUtils"];
export default func;
