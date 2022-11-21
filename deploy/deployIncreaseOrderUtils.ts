import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const { address: increasePositionUtilsAddress } = await get("IncreasePositionUtils");

  await deploy("IncreaseOrderUtils", {
    from: deployer,
    log: true,
    libraries: {
      IncreasePositionUtils: increasePositionUtilsAddress,
    },
  });
};
func.tags = ["IncreaseOrderUtils"];
func.dependencies = ["IncreasePositionUtils"];
export default func;
