import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("DepositStoreUtils", {
    from: deployer,
    log: true,
  });
};
func.tags = ["DepositStoreUtils"];
export default func;
