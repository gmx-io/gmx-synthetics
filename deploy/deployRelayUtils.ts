import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "RelayUtils",
  libraryNames: ["MarketUtils", "SwapUtils"],
});

export default func;
