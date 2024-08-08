import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "ReaderUtils",
  libraryNames: ["MarketStoreUtils", "OrderStoreUtils", "ReaderPositionUtils"],
});

export default func;
