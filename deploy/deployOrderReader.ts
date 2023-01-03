import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("OrderReader", {
    from: deployer,
    log: true,
  });
};
func.tags = ["OrderReader"];
export default func;
