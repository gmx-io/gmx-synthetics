import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "GlvWithdrawalUtils",
  libraryNames: [
    "GasUtils",
    "GlvUtils",
    "GlvWithdrawalEventUtils",
    "GlvWithdrawalStoreUtils",
    "MarketStoreUtils",
    "MarketUtils",
    "ExecuteWithdrawalUtils",
    "WithdrawalEventUtils",
    "MultichainUtils",
    "CallbackUtils",
  ],
});

export default func;
