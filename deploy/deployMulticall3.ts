import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("Multicall3", {
    from: deployer,
    log: true,
    args: [],
  });
};
func.tags = ["Multicall"];
export default func;
