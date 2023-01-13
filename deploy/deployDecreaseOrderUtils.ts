import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "DecreaseOrderUtils",
  libraryNames: ["PositionStoreUtils", "DecreasePositionUtils", "OrderStoreUtils"],
});

export default func;
