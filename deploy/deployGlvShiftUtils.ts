import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "GlvShiftUtils",
  libraryNames: [
    "GasUtils",
    "GlvShiftEventUtils",
    "GlvShiftStoreUtils",
    "GlvUtils",
    "MarketStoreUtils",
    "MarketUtils",
    "ShiftEventUtils",
    "ShiftUtils",
  ],
});

export default func;
