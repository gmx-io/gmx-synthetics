import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "WithdrawalUtils",
  libraryNames: ["GasUtils", "MarketStoreUtils", "MarketEventUtils", "WithdrawalStoreUtils", "WithdrawalEventUtils"],
});

export default func;
