import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "DepositUtils",
  libraryNames: [
    "GasUtils",
    "FeeUtils",
    "MarketStoreUtils",
    "MarketEventUtils",
    "DepositStoreUtils",
    "DepositEventUtils",
  ],
});

export default func;
