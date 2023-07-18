import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "ReferralUtils",
  libraryNames: ["MarketUtils", "ReferralEventUtils"],
});

export default func;
