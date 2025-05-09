import { createDeployFunction, skipHandlerFunction } from "../utils/deploy";

const contractName = "ExternalHandler";

const func = createDeployFunction({
  contractName: contractName,
  id: "ExternalHandler_1",
});

func.skip = skipHandlerFunction(contractName);

export default func;
