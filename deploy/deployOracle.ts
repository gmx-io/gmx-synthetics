import { hashString } from "../utils/hash";

const func = async ({ getNamedAccounts, deployments }) => {
  const { deploy, get, execute } = deployments;
  const { deployer } = await getNamedAccounts();

  const { address: roleStoreAddress } = await get("RoleStore");
  const { address: oracleStoreAddress } = await get("OracleStore");

  const { address, newlyDeployed } = await deploy("Oracle", {
    from: deployer,
    log: true,
    args: [roleStoreAddress, oracleStoreAddress],
  });

  if (newlyDeployed) {
    await execute("RoleStore", { from: deployer, log: true }, "grantRole", address, hashString("CONTROLLER"));
  }
};
func.tags = ["Oracle"];
func.dependencies = ["RoleStore", "OracleStore", "Tokens"];
export default func;
