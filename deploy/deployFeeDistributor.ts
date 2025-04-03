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
  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract.address, "CONTROLLER");
    await grantRoleIfNotGranted(deployedContract.address, "FEE_KEEPER");
  },
});

export default func;
