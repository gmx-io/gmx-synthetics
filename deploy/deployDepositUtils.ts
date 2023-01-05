import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const gasUtils = await get("GasUtils");
  const depositStoreUtils = await get("DepositStoreUtils");

  await deploy("DepositUtils", {
    from: deployer,
    log: true,
    libraries: {
      GasUtils: gasUtils.address,
      DepositStoreUtils: depositStoreUtils.address,
    },
  });
};
func.tags = ["DepositUtils"];
func.dependencies = ["GasUtils", "DepositStoreUtils"];
export default func;
