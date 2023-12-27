import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "MockPriceFeed",
});

export default func;
