import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "DepositUtils",
  libraryNames: [
    "GasUtils",
    "FeeUtils",
    "MarketStoreUtils",
    "MarketEventUtils",
    "DepositStoreUtils",
    "DepositEventUtils",
    "ExecuteDepositUtils",
    "CallbackUtils",
    "MarketUtils",
  ],
});

export default func;
