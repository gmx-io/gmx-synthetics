import { HardhatRuntimeEnvironment } from "hardhat/types";
import { setUintIfDifferent } from "../utils/dataStore";
import { hashString } from "../utils/hash";
import { decimalToFloat } from "../utils/math";

const func = async ({ getNamedAccounts, deployments }: HardhatRuntimeEnvironment) => {
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const roleStore = await get("RoleStore");

  await deploy("DataStore", {
    from: deployer,
    log: true,
    args: [roleStore.address],
  });

  await setUintIfDifferent(hashString("MAX_LEVERAGE"), decimalToFloat(100), "max leverage");
};
func.tags = ["DataStore"];
func.dependencies = ["RoleStore"];
export default func;
