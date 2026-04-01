import { createDeployFunction } from "../utils/deploy";
import { EIP6492_DEPLOYER } from "../utils/keys";

const func = createDeployFunction({
  contractName: "EIP6492Deployer",
  afterDeploy: async ({ deployedContract, deployments }) => {
    const { get } = deployments;
    const dataStoreDeployment = await get("DataStore");
    const dataStore = await ethers.getContractAt("DataStore", dataStoreDeployment.address);
    const currentValue = await dataStore.getAddress(EIP6492_DEPLOYER);
    if (currentValue !== deployedContract.address) {
      console.log(`Setting EIP6492_DEPLOYER in DataStore to ${deployedContract.address}`);
      await dataStore.setAddress(EIP6492_DEPLOYER, deployedContract.address);
    }
  },
  id: "EIP6492Deployer_1",
});

export default func;
