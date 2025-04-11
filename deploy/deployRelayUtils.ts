import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "RelayUtils",
  libraryNames: ["SwapUtils", "MarketStoreUtils"],
});

export default func;
