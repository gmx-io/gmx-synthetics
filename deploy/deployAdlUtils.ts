import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "AdlUtils",
  libraryNames: ["PositionStoreUtils", "OrderStoreUtils", "OrderEventUtils", "CallbackUtils", "MarketUtils"],
});

export default func;
