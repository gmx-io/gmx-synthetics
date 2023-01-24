import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "DecreaseOrderUtils",
  libraryNames: ["SwapUtils", "PositionStoreUtils", "DecreasePositionUtils", "OrderStoreUtils"],
});

export default func;
