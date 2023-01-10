import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "DepositUtils",
  libraryNames: ["GasUtils", "DepositStoreUtils", "DepositEventUtils", "MarketEventUtils"],
});

export default func;
