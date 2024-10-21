import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction } from "../utils/deploy";

const constructorContracts = ["RoleStore", "Oracle", "DataStore", "EventEmitter"];

const func = createDeployFunction({
  contractName: "FeeHandler",
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts, gmx, network, get }) => {
    const vaultV1Config = await gmx.getVaultV1();
    let vaultV1Address = vaultV1Config.vaultV1;
    let gmxAddress = vaultV1Config.gmx;
    if (network.name === "hardhat") {
      const vaultV1 = await get("MockVaultV1");
      const tokens = await hre.gmx.getTokens();
      vaultV1Address = vaultV1.address;
      gmxAddress = tokens.GMX.address;
    }
    if (!vaultV1Address) {
      throw new Error("vaultV1Address is not defined");
    }
    return constructorContracts
      .map((dependencyName) => dependencyContracts[dependencyName].address)
      .concat(vaultV1Address)
      .concat(gmxAddress);
  },
  libraryNames: ["MarketUtils"],
  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract.address, "CONTROLLER");
  },
});

func.dependencies = func.dependencies.concat(["MockVaultV1"]);

export default func;
