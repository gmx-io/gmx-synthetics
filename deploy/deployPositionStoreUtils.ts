import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("PositionStoreUtils", {
    from: deployer,
    log: true,
  });
};
func.tags = ["PositionStoreUtils"];
export default func;
