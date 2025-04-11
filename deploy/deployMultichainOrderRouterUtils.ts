import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "MultichainOrderRouterUtils",
  libraryNames: ["MarketStoreUtils", "MultichainUtils", "OrderStoreUtils", "PositionStoreUtils", "PositionUtils"],
});

export default func;
