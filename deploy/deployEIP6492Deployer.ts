import { createDeployFunction } from "../utils/deploy";
import { EIP6492_DEPLOYER } from "../utils/keys";

const constructorContracts = ["RoleStore"];

const func = createDeployFunction({
  contractName: "EIP6492Deployer",
  dependencyNames: ["Config", "DataStore", ...constructorContracts],
  getDeployArgs: async ({ dependencyContracts }) => {
    return constructorContracts.map((dependencyName) => dependencyContracts[dependencyName].address);
  },
  afterDeploy: async ({ deployedContract, deployments }) => {
    const { get } = deployments;
    const dataStoreDeployment = await get("DataStore");
    const dataStore = await ethers.getContractAt("DataStore", dataStoreDeployment.address);
    const currentValue = await dataStore.getAddress(EIP6492_DEPLOYER);
    if (currentValue.toLowerCase() !== deployedContract.address.toLowerCase()) {
      if (hre.gmx.isExistingMainnetDeployment) {
        console.info(
          "skipping EIP6492_DEPLOYER address config, as deployer does not have access to setAddress in the config"
        );
      } else {
        console.log(`Setting EIP6492_DEPLOYER in DataStore to ${deployedContract.address}`);
        const configDeployment = await get("Config");
        const config = await ethers.getContractAt("Config", configDeployment.address);
        await config.setAddress(EIP6492_DEPLOYER, "0x", deployedContract.address);
      }
    }
  },
  id: "EIP6492Deployer_2",
});

export default func;
