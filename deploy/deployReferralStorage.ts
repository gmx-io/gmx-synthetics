import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("ReferralStorage", {
    from: deployer,
    log: true,
    args: [],
    libraries: {},
  });
};
func.tags = ["ReferralStorage"];
func.dependencies = [];
export default func;
