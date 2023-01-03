import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const positionStoreUtils = await get("PositionStoreUtils");

  await deploy("AdlUtils", {
    from: deployer,
    log: true,
    libraries: {
      PositionStoreUtils: positionStoreUtils.address,
    },
  });
};
func.tags = ["AdlUtils"];
func.dependencies = ["PositionStoreUtils"];
export default func;
