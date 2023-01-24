import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "SwapOrderUtils",
  libraryNames: ["OrderStoreUtils", "SwapUtils"],
});

export default func;
