import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("WithdrawalStoreUtils", {
    from: deployer,
    log: true,
  });
};
func.tags = ["WithdrawalStoreUtils"];
export default func;
