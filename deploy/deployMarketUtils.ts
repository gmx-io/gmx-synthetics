import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const { address: marketEventUtilsAddress } = await get("MarketEventUtils");

  await deploy("MarketUtils", {
    from: deployer,
    log: true,
    libraries: {
      MarketEventUtils: marketEventUtilsAddress,
    },
  });
};
func.tags = ["MarketUtils"];
func.dependencies = ["MarketEventUtils"];
export default func;
