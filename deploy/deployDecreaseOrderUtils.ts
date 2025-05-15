import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "DecreaseOrderUtils",
  libraryNames: ["MultichainUtils", "DecreasePositionUtils", "PositionStoreUtils"],
});

export default func;
