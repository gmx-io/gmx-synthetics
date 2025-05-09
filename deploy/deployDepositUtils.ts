import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "DepositUtils",
  libraryNames: [
    "CallbackUtils",
    "DepositEventUtils",
    "DepositStoreUtils",
    "GasUtils",
    "MarketUtils",
    "MultichainUtils",
  ],
});

export default func;
