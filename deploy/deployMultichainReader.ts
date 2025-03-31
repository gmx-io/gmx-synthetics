import { grantRoleIfNotGranted } from "../utils/role";
import { createDeployFunction } from "../utils/deploy";

const constructorContracts = ["RoleStore", "DataStore", "EventEmitter"];

const func = createDeployFunction({
  contractName: "MultichainReader",
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts, gmx, network, get }) => {
    const layerZeroConfig = await gmx.getLayerZeroEndpoint();
    let endpointAddress = layerZeroConfig.endpoint;
    if (network.name === "hardhat") {
      const endpoint = await get("MockEndpointV2");
      endpointAddress = endpoint.address;
    }
    if (!endpointAddress) {
      throw new Error("endpointAddress is not defined");
    }
    return constructorContracts
      .map((dependencyName) => dependencyContracts[dependencyName].address)
      .concat(endpointAddress);
  },
  afterDeploy: async ({ deployedContract }) => {
    await grantRoleIfNotGranted(deployedContract.address, "CONTROLLER");
  },
});

func.dependencies = func.dependencies.concat(["MockEndpointV2"]);

export default func;
