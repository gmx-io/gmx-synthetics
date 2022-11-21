import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("DecreasePositionUtils", {
    from: deployer,
    log: true,
  });
};
func.tags = ["DecreasePositionUtils"];
export default func;
