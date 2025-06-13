import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "ExecuteDepositUtils",
  libraryNames: [
    "CallbackUtils",
    "DepositEventUtils",
    "DepositStoreUtils",
    "FeeUtils",
    "GasUtils",
    "MarketEventUtils",
    "MarketUtils",
    "BridgeOutFromControllerUtils",
    "MultichainUtils",
    "PositionUtils",
    "SwapPricingUtils",
  ],
});

export default func;
