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
    "MultichainUtils",
    "CallbackUtils",
    "MarketUtils",
  ],
});

export default func;
