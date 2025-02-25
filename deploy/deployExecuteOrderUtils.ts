import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "ExecuteOrderUtils",
  libraryNames: [
    "MarketStoreUtils",
    "MarketUtils",
    "OrderStoreUtils",
    "OrderEventUtils",
    "IncreaseOrderUtils",
    "DecreaseOrderUtils",
    "SwapOrderUtils",
    "GasUtils",
    "PositionUtils",
    "CallbackUtils",
  ],
});

export default func;
