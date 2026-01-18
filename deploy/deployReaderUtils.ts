import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "ReaderUtils",
  libraryNames: ["MarketStoreUtils", "OrderStoreUtils", "PositionStoreUtils", "ReaderPositionUtils", "MarketUtils"],
});

export default func;
