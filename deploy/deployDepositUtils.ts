import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const gasUtils = await get("GasUtils");

  await deploy("DepositUtils", {
    from: deployer,
    log: true,
    libraries: {
      GasUtils: gasUtils.address,
    },
  });
};
func.tags = ["DepositUtils"];
func.dependencies = ["GasUtils"];
export default func;
