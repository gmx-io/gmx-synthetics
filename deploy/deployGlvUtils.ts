import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "GlvUtils",
  libraryNames: ["MarketUtils", "MarketStoreUtils", "GlvStoreUtils"],
});

export default func;
