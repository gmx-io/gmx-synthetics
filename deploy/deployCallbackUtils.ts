import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "CallbackUtils",
  libraryNames: [
    "GlvDepositEventUtils",
    "GlvWithdrawalEventUtils",
    "OrderEventUtils",
    "WithdrawalEventUtils",
    "DepositEventUtils",
    "ShiftEventUtils",
  ],
});

export default func;
