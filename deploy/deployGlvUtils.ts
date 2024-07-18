import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "GlvUtils",
  libraryNames: ["MarketStoreUtils"],
});

export default func;
