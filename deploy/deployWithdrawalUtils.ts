import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "WithdrawalUtils",
  libraryNames: ["GasUtils", "WithdrawalStoreUtils", "WithdrawalEventUtils", "MarketEventUtils"],
});

export default func;
