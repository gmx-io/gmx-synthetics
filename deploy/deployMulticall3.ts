import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "Multicall3",
  id: "Multicall3",
});
// override tags
func.tags = ["Multicall"];

export default func;
