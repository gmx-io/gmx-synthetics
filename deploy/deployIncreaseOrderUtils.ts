import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "IncreaseOrderUtils",
  libraryNames: ["SwapUtils", "PositionStoreUtils", "IncreasePositionUtils", "OrderStoreUtils", "MarketEventUtils"],
});

export default func;
