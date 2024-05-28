import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "ExecuteWithdrawalUtils",
  libraryNames: [
    "GasUtils",
    "FeeUtils",
    "MarketUtils",
    "MarketStoreUtils",
    "MarketEventUtils",
    "WithdrawalStoreUtils",
    "WithdrawalEventUtils",
    "SwapUtils",
    "SwapPricingUtils",
    "PositionUtils",
  ],
});

export default func;
