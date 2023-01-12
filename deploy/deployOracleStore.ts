import { HardhatRuntimeEnvironment } from "hardhat/types";

const func = async ({ deployments, getNamedAccounts }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const roleStore = await get("RoleStore");

  await deploy("OracleStore", {
    from: deployer,
    log: true,
    args: [roleStore.address],
  });
};
func.tags = ["OracleStore"];
func.dependencies = ["RoleStore"];
export default func;
