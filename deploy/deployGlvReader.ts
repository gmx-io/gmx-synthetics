import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "GlvReader",
  libraryNames: [
    "GlvStoreUtils",
    "GlvDepositStoreUtils",
    "GlvShiftStoreUtils",
    "GlvWithdrawalStoreUtils",
    "GlvUtils",
    "MarketStoreUtils",
    "MarketUtils",
  ],
});

export default func;
