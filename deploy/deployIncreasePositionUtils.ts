import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "IncreasePositionUtils",
  libraryNames: [
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
