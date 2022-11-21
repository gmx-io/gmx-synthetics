import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("FeeReceiver", {
    from: deployer,
    log: true,
  });
};
func.tags = ["FeeReceiver"];
export default func;
