import { DeployFunction } from "hardhat-deploy/dist/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

import { getExistingContractAddresses } from "../config/overwrite";
import { grantRoleIfNotGranted } from "../utils/role";
import { getLegacyAddresses, skipIncentiveLegacyDeploy } from "../utils/incentive";

// the legacy-vester handler grants are a migration action, deliberately not made here
const dependencyNames = ["RoleStore", "EventEmitter"];

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const dependencyContracts = getExistingContractAddresses(hre.network);
  for (const name of dependencyNames) {
    if (dependencyContracts[name] === undefined) {
      dependencyContracts[name] = await get(name);
    }
  }
  const legacy = await getLegacyAddresses(hre);

  const gmxZeroer = await deploy("GmxVesterCapZeroer", {
    contract: "VesterCapZeroer",
    from: deployer,
    log: true,
    args: [dependencyContracts.RoleStore.address, dependencyContracts.EventEmitter.address, legacy.gmxVester],
  });

  const glpZeroer = await deploy("GlpVesterCapZeroer", {
    contract: "VesterCapZeroer",
    from: deployer,
    log: true,
    args: [dependencyContracts.RoleStore.address, dependencyContracts.EventEmitter.address, legacy.glpVester],
  });

  await grantRoleIfNotGranted(gmxZeroer, "CONTROLLER", "GmxVesterCapZeroer");
  await grantRoleIfNotGranted(glpZeroer, "CONTROLLER", "GlpVesterCapZeroer");

  const incentive = await hre.gmx.getIncentive();
  if (incentive.referralVester) {
    const referralZeroer = await deploy("ReferralVesterCapZeroer", {
      contract: "VesterCapZeroer",
      from: deployer,
      log: true,
      args: [dependencyContracts.RoleStore.address, dependencyContracts.EventEmitter.address, incentive.referralVester],
    });
    await grantRoleIfNotGranted(referralZeroer, "CONTROLLER", "ReferralVesterCapZeroer");
  }

  return true;
};

func.tags = ["GmxVesterCapZeroer", "GlpVesterCapZeroer", "VesterCapZeroers"];
func.dependencies = dependencyNames;
func.skip = skipIncentiveLegacyDeploy;
func.id = "VesterCapZeroers_1";

export default func;
