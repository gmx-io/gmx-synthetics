import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const increasePositionUtils = await get("IncreasePositionUtils");

  await deploy("IncreaseOrderUtils", {
    from: deployer,
    log: true,
    libraries: {
      IncreasePositionUtils: increasePositionUtils.address,
    },
  });
};
func.tags = ["IncreaseOrderUtils"];
func.dependencies = ["IncreasePositionUtils"];
export default func;
