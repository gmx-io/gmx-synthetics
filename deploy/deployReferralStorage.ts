import { HardhatRuntimeEnvironment } from "hardhat/types";
import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "ReferralStorage",
  id: "ReferralStorage",
});

func.skip = async ({ network }: HardhatRuntimeEnvironment) => {
  return network.name !== "avalancheFuji" && network.name !== "arbitrumGoerli";
};

export default func;
