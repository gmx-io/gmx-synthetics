import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "WithdrawalUtils",
  libraryNames: [
    "GasUtils",
    "FeeUtils",
    "MarketUtils",
    "MarketStoreUtils",
    "MarketEventUtils",
    "WithdrawalStoreUtils",
    "WithdrawalEventUtils",
    "SwapUtils",
    "CallbackUtils",
  ],
});

export default func;
