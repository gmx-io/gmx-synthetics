import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "IncreasePositionUtils",
  libraryNames: [
    "MarketUtils",
    "MarketEventUtils",
    "PositionStoreUtils",
    "PositionEventUtils",
    "ReferralEventUtils",
    "PositionPricingUtils",
  ],
});

export default func;
