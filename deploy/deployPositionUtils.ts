import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "PositionUtils",
  libraryNames: ["MarketUtils"],
});

export default func;
