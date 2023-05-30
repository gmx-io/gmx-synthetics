import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "ReaderUtils",
  libraryNames: ["MarketStoreUtils", "PositionStoreUtils", "PositionUtils"],
});

export default func;
