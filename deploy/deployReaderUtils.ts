import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "ReaderUtils",
  libraryNames: [
    "MarketStoreUtils",
    "DepositStoreUtils",
    "WithdrawalStoreUtils",
    "PositionStoreUtils",
    "OrderStoreUtils",
  ],
});

export default func;
