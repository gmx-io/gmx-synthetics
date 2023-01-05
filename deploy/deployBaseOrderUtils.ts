import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("BaseOrderUtils", {
    from: deployer,
    log: true,
  });
};
func.tags = ["BaseOrderUtils"];
export default func;
