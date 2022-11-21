import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("AdlUtils", {
    from: deployer,
    log: true,
  });
};
func.tags = ["AdlUtils"];
export default func;
