import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const gasUtils = await get("GasUtils");
  const withdrawalStoreUtils = await get("WithdrawalStoreUtils");

  await deploy("WithdrawalUtils", {
    from: deployer,
    log: true,
    libraries: {
      GasUtils: gasUtils.address,
      WithdrawalStoreUtils: withdrawalStoreUtils.address,
    },
  });
};
func.tags = ["WithdrawalUtils"];
func.dependencies = ["GasUtils", "WithdrawalStoreUtils"];
export default func;
