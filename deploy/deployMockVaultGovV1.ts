import { HardhatRuntimeEnvironment } from "hardhat/types";
import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "MockVaultGovV1",
});

func.skip = async ({ network }: HardhatRuntimeEnvironment) => {
  const shouldDeployForNetwork = ["hardhat"];
  return !shouldDeployForNetwork.includes(network.name);
};

export default func;
