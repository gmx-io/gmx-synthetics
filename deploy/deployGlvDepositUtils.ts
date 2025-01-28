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
    "GlvDepositHelper",
    "MarketStoreUtils",
  ],
});

export default func;
