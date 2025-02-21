import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "ReaderUtils",
  libraryNames: ["MarketStoreUtils", "OrderStoreUtils", "ReaderPositionUtils", "MarketUtils"],
});

export default func;
