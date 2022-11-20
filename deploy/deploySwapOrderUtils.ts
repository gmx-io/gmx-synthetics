import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("SwapOrderUtils", {
    from: deployer,
    log: true,
  });
};
func.tags = ["SwapOrderUtils"];
export default func;
