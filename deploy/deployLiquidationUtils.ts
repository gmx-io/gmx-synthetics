import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "LiquidationUtils",
  libraryNames: ["PositionStoreUtils", "OrderStoreUtils", "OrderEventUtils", "CallbackUtils"],
});

export default func;
