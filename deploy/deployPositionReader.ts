import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const positionStoreUtils = await get("PositionStoreUtils");

  await deploy("PositionReader", {
    from: deployer,
    log: true,
    libraries: {
      PositionStoreUtils: positionStoreUtils.address,
    },
  });
};
func.tags = ["PositionReader"];
func.dependencies = ["PositionStoreUtils"];
export default func;
