import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction } from "../utils/deploy";

const constructorContracts = [
  "RoleStore",
  "Oracle",
  "FeeDistributorVault",
  "FeeHandler",
  "DataStore",
  "EventEmitter",
  "MultichainReader",
  "ClaimVault",
];

const func = createDeployFunction({
  contractName: "FeeDistributor",
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts, gmx, network }) => {
    const feeDistributorConfig = await gmx.getFeeDistributor();
    let gmxAddress = feeDistributorConfig.gmx;
    let esGmxAddress = feeDistributorConfig.esGmx;
    let wntAddress = feeDistributorConfig.wnt;
    if (network.name === "hardhat") {
      const tokens = await hre.gmx.getTokens();
      gmxAddress = tokens.GMX.address;
      esGmxAddress = tokens.ESGMX.address;
      wntAddress = tokens.WETH.address;
    }
    if (!gmxAddress) {
      throw new Error("gmxAddress is not defined");
    }
    if (!esGmxAddress) {
      throw new Error("esGmxAddress is not defined");
    }
    if (!wntAddress) {
      throw new Error("wntAddress is not defined");
    }
    return constructorContracts
      .map((dependencyName) => dependencyContracts[dependencyName].address)
      .concat(gmxAddress)
      .concat(esGmxAddress)
      .concat(wntAddress);
  },
  libraryNames: ["FeeDistributorUtils", "ClaimUtils"],
  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract, "CONTROLLER");
    await grantRoleIfNotGranted(deployedContract, "FEE_KEEPER");
  },
  // FeeDistributor should not be automatically re-deployed as the
  // new FeeDistributor would not be whitelisted for bridging GMX tokens
  // if a new FeeDistributor is deployed, action is required to whitelist it
  // after deployment
  id: "FeeDistributor_1",
});

export default func;
