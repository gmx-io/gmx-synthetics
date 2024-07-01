import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "ExternalHandler",
});

export default func;
