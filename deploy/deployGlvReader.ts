import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "GlvReader",
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
