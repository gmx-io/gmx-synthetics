// minHandleExecutionErrorGas + max(depositGasLimitSingle, depositGasLimitMultiple, withdrawalGasLimit, increaseOrderGasLimit, decreaseOrderGasLimit, swapOrderGasLimit) + estimatedGasFeeBaseAmount + singleSwapGasLimit * (maxSwapPathLength +1) + maxCallbackGasLimit

import hre from "hardhat";
import * as keys from "../utils/keys";

async function main() {
  const dataStore = await hre.ethers.getContract("DataStore");

  const [
    minHandleExecutionErroGas,
    depositGasLimitSingle,
    withdrawalGasLimit,
    increaseOrderGasLimit,
    decreaseOrderGasLimit,
    swapOrderGasLimit,
    estimatedGasFeeBaseAmount,
    singleSwapGasLimit,
    maxCallbackGasLimit,
  ] = await Promise.all([
    dataStore.getUint(keys.MIN_HANDLE_EXECUTION_ERROR_GAS),
    dataStore.getUint(keys.DEPOSIT_GAS_LIMIT),
    dataStore.getUint(keys.WITHDRAWAL_GAS_LIMIT),
    dataStore.getUint(keys.INCREASE_ORDER_GAS_LIMIT),
    dataStore.getUint(keys.DECREASE_ORDER_GAS_LIMIT),
    dataStore.getUint(keys.SWAP_ORDER_GAS_LIMIT),
    dataStore.getUint(keys.ESTIMATED_GAS_FEE_BASE_AMOUNT_V2_1),
    dataStore.getUint(keys.SINGLE_SWAP_GAS_LIMIT),
    dataStore.getUint(keys.MAX_CALLBACK_GAS_LIMIT),
  ]);

  let maxActionGasLimit = depositGasLimitSingle;

  for (const gasLimit of [withdrawalGasLimit, increaseOrderGasLimit, decreaseOrderGasLimit, swapOrderGasLimit]) {
    if (maxActionGasLimit.lt(gasLimit)) {
      maxActionGasLimit = gasLimit;
    }
  }

  const total = minHandleExecutionErroGas
    .add(maxActionGasLimit)
    .add(estimatedGasFeeBaseAmount)
    .add(singleSwapGasLimit.mul(4))
    .add(maxCallbackGasLimit);

  console.log("total %s", total);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
