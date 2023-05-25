import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "IncreasePositionUtils",
  libraryNames: [
    "BaseOrderUtils",
    "FeeUtils",
    "MarketUtils",
    "MarketEventUtils",
    "PositionUtils",
    "PositionStoreUtils",
    "PositionEventUtils",
    "ReferralEventUtils",
  ],
});

export default func;
