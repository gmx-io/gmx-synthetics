import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "DecreasePositionUtils",
  libraryNames: [
    "MarketUtils",
    "MarketEventUtils",
    "PositionStoreUtils",
    "PositionEventUtils",
    "PositionPricingUtils",
    "ReferralEventUtils",
    "DecreasePositionCollateralUtils",
  ],
});

export default func;
