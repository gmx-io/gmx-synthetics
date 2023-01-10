import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "AdlUtils",
  libraryNames: ["PositionStoreUtils", "OrderStoreUtils"],
});

export default func;
