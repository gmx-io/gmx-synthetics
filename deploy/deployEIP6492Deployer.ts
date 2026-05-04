import { createDeployFunction } from "../utils/deploy";
import { EIP6492_DEPLOYER } from "../utils/keys";

const func = createDeployFunction({
  contractName: "EIP6492Deployer",
  dependencyNames: ["Config", "DataStore"],
  afterDeploy: async ({ deployedContract, deployments }) => {
    const { get } = deployments;
    const dataStoreDeployment = await get("DataStore");
    const dataStore = await ethers.getContractAt("DataStore", dataStoreDeployment.address);
    const currentValue = await dataStore.getAddress(EIP6492_DEPLOYER);
    if (currentValue.toLowerCase() !== deployedContract.address.toLowerCase()) {
      console.log(`Setting EIP6492_DEPLOYER in DataStore to ${deployedContract.address}`);
      const configDeployment = await get("Config");
      const config = await ethers.getContractAt("Config", configDeployment.address);
      await config.setAddress(EIP6492_DEPLOYER, "0x", deployedContract.address);
    }
  },
  id: "EIP6492Deployer_1",
});

export default func;
