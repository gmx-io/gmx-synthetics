import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "AdlUtils",
  libraryNames: ["MarketStoreUtils", "PositionStoreUtils", "OrderStoreUtils", "OrderEventUtils"],
});

export default func;
