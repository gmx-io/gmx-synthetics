import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "ExternalHandler",
  id: "ExternalHandler-new",
});

export default func;
