import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "ShiftUtils",
  libraryNames: [
    "GasUtils",
    "MarketStoreUtils",
    "ShiftStoreUtils",
    "ShiftEventUtils",
    "DepositEventUtils",
    "WithdrawalEventUtils",
    "ExecuteDepositUtils",
    "ExecuteWithdrawalUtils",
    "CallbackUtils",
    "MarketUtils",
  ],
});

export default func;
