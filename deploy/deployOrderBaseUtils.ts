import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("OrderBaseUtils", {
    from: deployer,
    log: true,
  });
};
func.tags = ["OrderBaseUtils"];
export default func;
