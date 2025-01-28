import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "GlvDepositHelper",
  libraryNames: ["MarketUtils", "MarketStoreUtils"],
});

export default func;
