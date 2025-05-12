import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "WithdrawalUtils",
  libraryNames: [
    "CallbackUtils",
    "GasUtils",
    "MarketUtils",
    "MultichainUtils",
    "WithdrawalEventUtils",
    "WithdrawalStoreUtils",
  ],
});

export default func;
