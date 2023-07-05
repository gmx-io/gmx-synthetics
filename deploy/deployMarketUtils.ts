import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "MarketUtils",
  libraryNames: ["MarketEventUtils", "MarketStoreUtils"],
});

export default func;
