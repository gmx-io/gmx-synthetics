import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction } from "../utils/deploy";
import { getLegacyAddresses, getLegacyRouterConfig, skipIncentiveLegacyDeploy } from "../utils/incentive";

const constructorContracts = ["RoleStore", "DataStore", "EventEmitter"];

const func = createDeployFunction({
  contractName: "RewardRouterV3",
  dependencyNames: [...constructorContracts, "EsGmxIssuer", "ExternalHandler"],
  getDeployArgs: async ({ dependencyContracts }) => {
    const legacy = await getLegacyAddresses(hre);
    const routerConfig = await getLegacyRouterConfig(hre);
    return [
      {
        roleStore: dependencyContracts.RoleStore.address,
        dataStore: dependencyContracts.DataStore.address,
        eventEmitter: dependencyContracts.EventEmitter.address,
        weth: legacy.weth,
        gmx: legacy.gmx,
        esGmx: legacy.esGmx,
        bnGmx: legacy.bnGmx,
        glp: legacy.glp,
        stakedGmxTracker: legacy.stakedGmxTracker,
        bonusGmxTracker: legacy.bonusGmxTracker,
        extendedGmxTracker: legacy.extendedGmxTracker,
        feeGmxTracker: legacy.feeGmxTracker,
        feeGlpTracker: legacy.feeGlpTracker,
        stakedGlpTracker: legacy.stakedGlpTracker,
        gmxVester: legacy.gmxVester,
        glpVester: legacy.glpVester,
        externalHandler: dependencyContracts.ExternalHandler.address,
        govToken: legacy.govToken,
        esGmxIssuer: dependencyContracts.EsGmxIssuer.address,
        maxBoostBasisPoints: routerConfig.maxBoostBasisPoints,
        inStrictTransferMode: routerConfig.inStrictTransferMode,
        votingPowerType: routerConfig.votingPowerType,
      },
    ];
  },
  libraryNames: ["RewardRouterUtils", "IncentiveEventUtils"],
  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract, "CONTROLLER");
    // the designated-vester allowlist is a TIMELOCK_ADMIN migration action, deliberately not made here
  },
  id: "RewardRouterV3_1",
});

func.skip = skipIncentiveLegacyDeploy;

export default func;
