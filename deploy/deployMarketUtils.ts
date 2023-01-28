import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "MarketUtils",
  libraryNames: ["MarketEventUtils"],
});

export default func;
