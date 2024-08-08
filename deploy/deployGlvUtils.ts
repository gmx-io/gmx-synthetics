import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "GlvUtils",
  libraryNames: ["MarketStoreUtils", "GlvStoreUtils"],
});

export default func;
