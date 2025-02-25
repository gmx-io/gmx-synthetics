import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "GlvDepositUtils",
  libraryNames: [
    "MarketUtils",
    "GlvUtils",
    "DepositEventUtils",
    "ExecuteDepositUtils",
    "GasUtils",
    "GlvDepositEventUtils",
    "GlvDepositStoreUtils",
    "GlvDepositCalc",
    "MarketStoreUtils",
    "MultichainUtils",
    "CallbackUtils",
  ],
});

export default func;
