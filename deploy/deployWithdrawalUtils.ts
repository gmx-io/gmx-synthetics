import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "WithdrawalUtils",
  libraryNames: [
    "GasUtils",
    "FeeUtils",
    "MarketStoreUtils",
    "MarketEventUtils",
    "WithdrawalStoreUtils",
    "WithdrawalEventUtils",
  ],
});

export default func;
