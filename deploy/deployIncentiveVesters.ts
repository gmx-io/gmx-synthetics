import { DeployFunction } from "hardhat-deploy/dist/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { ethers } from "ethers";

import { getExistingContractAddresses } from "../config/overwrite";
import { grantRoleIfNotGranted } from "../utils/role";
import { getIncentiveTokenAddresses, skipIncentiveDeploy, PAIR_RATIO_PRECISION } from "../utils/incentive";

// two instances of one artifact need explicit deployment names and the `contract` option,
// which createDeployFunction does not support
const dependencyNames = ["RoleStore", "DataStore", "EventEmitter"];

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deployments, getNamedAccounts } = hre;
  const { deploy, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const incentive = await hre.gmx.getIncentive();
  if (!incentive.seasonVester || !incentive.orphanVester) {
    throw new Error(`incentive vester config missing for network ${hre.network.name}`);
  }

  const dependencyContracts = getExistingContractAddresses(hre.network);
  for (const name of dependencyNames) {
    if (dependencyContracts[name] === undefined) {
      dependencyContracts[name] = await get(name);
    }
  }
  const issuer = await get("EsGmxIssuer");
  const tokens = await getIncentiveTokenAddresses(hre);

  const baseParams = {
    roleStore: dependencyContracts.RoleStore.address,
    dataStore: dependencyContracts.DataStore.address,
    eventEmitter: dependencyContracts.EventEmitter.address,
    esToken: tokens.esGmx,
    pairToken: tokens.pairToken,
    claimableToken: tokens.claimableToken,
    isUncapped: false,
  };

  const season = await deploy("SeasonRatioVester", {
    contract: "RatioVester",
    from: deployer,
    log: true,
    args: [
      {
        ...baseParams,
        name: incentive.seasonVester.name,
        symbol: incentive.seasonVester.symbol,
        vestingDuration: incentive.seasonVester.vestingDuration,
        issuer: issuer.address,
        pairRatioFactor: ethers.BigNumber.from(PAIR_RATIO_PRECISION).mul(incentive.seasonVester.pairRatio).toString(),
      },
    ],
  });

  const orphan = await deploy("OrphanRatioVester", {
    contract: "RatioVester",
    from: deployer,
    log: true,
    args: [
      {
        ...baseParams,
        name: incentive.orphanVester.name,
        symbol: incentive.orphanVester.symbol,
        vestingDuration: incentive.orphanVester.vestingDuration,
        issuer: ethers.constants.AddressZero,
        pairRatioFactor: ethers.BigNumber.from(PAIR_RATIO_PRECISION).mul(incentive.orphanVester.pairRatio).toString(),
      },
    ],
  });

  await grantRoleIfNotGranted(season, "CONTROLLER", "SeasonRatioVester");
  await grantRoleIfNotGranted(orphan, "CONTROLLER", "OrphanRatioVester");

  return true;
};

func.tags = ["SeasonRatioVester", "OrphanRatioVester", "IncentiveVesters"];
func.dependencies = [...dependencyNames, "EsGmxIssuer", "IncentiveMockTokens"];
func.skip = skipIncentiveDeploy;
// a redeployed vester would lose the confirmed issuer binding, the provisioned caps,
// the funding, and its grants; a redeploy requires explicit migration handling
func.id = "IncentiveVesters_1";

export default func;
