import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "ShiftUtils",
  libraryNames: [
    "GasUtils",
    "MarketStoreUtils",
    "MarketEventUtils",
    "ShiftStoreUtils",
    "ShiftEventUtils",
    "ExecuteDepositUtils",
    "ExecuteWithdrawalUtils",
  ],
});

export default func;
