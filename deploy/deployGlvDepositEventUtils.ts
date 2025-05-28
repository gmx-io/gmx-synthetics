import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "GlvDepositEventUtils",
  libraryNames: [
    // "GlvDepositMappingUtils",
  ],
});

export default func;
