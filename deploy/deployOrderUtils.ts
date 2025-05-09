import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "OrderUtils",
  libraryNames: [
    "MarketStoreUtils",
    "OrderStoreUtils",
    "OrderEventUtils",
    "GasUtils",
    "CallbackUtils",
    "MarketUtils",
    "MultichainUtils",
  ],
});

export default func;
