import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "ExecuteDepositUtils",
  libraryNames: [
    "GasUtils",
    "FeeUtils",
    "MarketUtils",
    "MarketStoreUtils",
    "MarketEventUtils",
    "DepositStoreUtils",
    "DepositEventUtils",
    "SwapUtils",
    "SwapPricingUtils",
    "PositionUtils",
    "MultichainUtils",
    "CallbackUtils",
  ],
});

export default func;
