import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "PositionUtils",
  libraryNames: [],
});

export default func;
