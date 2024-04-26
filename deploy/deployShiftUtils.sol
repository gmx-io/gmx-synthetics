import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "ShiftUtils",
  libraryNames: [
    "GasUtils",
    "FeeUtils",
    "MarketStoreUtils",
    "MarketEventUtils",
    "ShiftStoreUtils",
    "ShiftEventUtils",
  ],
});

export default func;
