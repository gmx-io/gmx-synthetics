import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const { address: gasUtilsAddress } = await get("GasUtils");

  await deploy("DepositUtils", {
    from: deployer,
    log: true,
    libraries: {
      GasUtils: gasUtilsAddress,
    },
  });
};
func.tags = ["DepositUtils"];
func.dependencies = ["GasUtils"];
export default func;
