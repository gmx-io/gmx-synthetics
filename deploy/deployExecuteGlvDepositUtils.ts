import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "ExecuteGlvDepositUtils",
  libraryNames: [
    "CallbackUtils",
    "DepositEventUtils",
    "ExecuteDepositUtils",
    "GasUtils",
    "GlvUtils",
    "GlvDepositCalc",
    "GlvDepositEventUtils",
    "GlvDepositStoreUtils",
    "MarketUtils",
    "BridgeOutFromControllerUtils",
    "MultichainUtils",
  ],
});

export default func;
