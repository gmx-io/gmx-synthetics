import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "Reader",
  libraryNames: [
    "MarketUtils",
    "MarketStoreUtils",
    "DepositStoreUtils",
    "WithdrawalStoreUtils",
    "PositionStoreUtils",
    "PositionUtils",
    "OrderStoreUtils",
    "ReaderUtils",
    "ReaderPricingUtils",
  ],
});

export default func;
