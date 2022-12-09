import { HardhatRuntimeEnvironment } from "hardhat/types";
import { grantRoleIfNotGranted } from "../utils/role";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const { address: roleStoreAddress } = await get("RoleStore");
  const { address: oracleStoreAddress } = await get("OracleStore");

  const { address } = await deploy("Oracle", {
    from: deployer,
    log: true,
    args: [roleStoreAddress, oracleStoreAddress],
  });

  await grantRoleIfNotGranted(address, "CONTROLLER");
};
func.tags = ["Oracle"];
func.dependencies = ["RoleStore", "OracleStore", "Tokens"];
export default func;
