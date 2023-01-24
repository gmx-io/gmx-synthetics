import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "OrderUtils",
  libraryNames: [
    "BaseOrderUtils",
    "MarketStoreUtils",
    "OrderStoreUtils",
    "OrderEventUtils",
    "IncreaseOrderUtils",
    "DecreaseOrderUtils",
    "SwapOrderUtils",
    "GasUtils",
  ],
});

export default func;
