import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "ReaderGlvUtils",
  libraryNames: [
    "GlvStoreUtils",
    "GlvDepositStoreUtils",
    "GlvShiftStoreUtils",
    "GlvWithdrawalStoreUtils",
    "MarketStoreUtils",
    "MarketUtils",
  ],
});

export default func;
