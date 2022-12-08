import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ deployments, getNamedAccounts }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const roleStoreDeployment = await get("RoleStore");

  await deploy("OracleStore", {
    from: deployer,
    log: true,
    args: [roleStoreDeployment.address],
  });
};
func.tags = ["OracleStore"];
func.dependencies = ["RoleStore"];
export default func;
