import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "DecreasePositionCollateralUtils",
  libraryNames: [
    "FeeUtils",
    "MarketEventUtils",
    "PositionUtils",
    "PositionPricingUtils",
    "PositionEventUtils",
    "OrderEventUtils",
  ],
});

export default func;
