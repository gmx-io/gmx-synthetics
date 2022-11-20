import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const { address: decreasePositionUtilsAddress } = await get("DecreasePositionUtils");

  await deploy("DecreaseOrderUtils", {
    from: deployer,
    log: true,
    libraries: {
      DecreasePositionUtils: decreasePositionUtilsAddress,
    },
  });
};
func.tags = ["DecreaseOrderUtils"];
func.dependencies = ["DecreasePositionUtils"];
export default func;
