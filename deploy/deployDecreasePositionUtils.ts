import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "DecreasePositionUtils",
  libraryNames: [
    "MarketUtils",
    "MarketEventUtils",
    "PositionUtils",
    "PositionStoreUtils",
    "PositionEventUtils",
    "OrderEventUtils",
    "PositionPricingUtils",
    "ReferralEventUtils",
    "DecreasePositionCollateralUtils",
  ],
});

export default func;
