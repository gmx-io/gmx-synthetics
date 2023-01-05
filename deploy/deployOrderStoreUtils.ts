import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("OrderStoreUtils", {
    from: deployer,
    log: true,
  });
};
func.tags = ["OrderStoreUtils"];
export default func;
