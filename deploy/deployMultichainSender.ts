import { HardhatRuntimeEnvironment } from "hardhat/types";
import { createDeployFunction } from "../utils/deploy";

const LAYER_ZERO_ENDPOINT = "0x6EDCE65403992e310A62460808c4b910D972f10f"; // sepolia

const constructorContracts = [];

const func = createDeployFunction({
  contractName: "MultichainSender",
  dependencyNames: constructorContracts,
  getDeployArgs: async ({ dependencyContracts, getNamedAccounts }) => {
    const { deployer } = await getNamedAccounts();
    return constructorContracts
      .map((dependencyName) => dependencyContracts[dependencyName].address)
      .concat([LAYER_ZERO_ENDPOINT, deployer]);
  },
});

func.skip = async ({ network }: HardhatRuntimeEnvironment) => {
  const shouldDeployForNetwork = ["sepolia"];
  return !shouldDeployForNetwork.includes(network.name);
};

export default func;
