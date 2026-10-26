import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "GasUtils",
  libraryNames: ["MultichainUtils", "MarketStoreUtils", "BridgeOutFromControllerUtils", "SwapUtils"],
});

export default func;
