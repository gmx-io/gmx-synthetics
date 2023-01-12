import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("GasUtils", {
    from: deployer,
    log: true,
  });
};
func.tags = ["GasUtils"];
export default func;
