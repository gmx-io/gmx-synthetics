import { expandDecimals } from "../utils/math";

export default async function () {
  return {
    depositGasLimitSingle: 10000,
    depositGasLimitMultiple: 10000,
    withdrawalGasLimitSingle: 10000,
    withdrawalGasLimitMultiple: 10000,

    singleSwapGasLimit: 10000,
    increaseOrderGasLimit: 10000,
    decreaseOrderGasLimit: 10000,
    swapOrderGasLimit: 10000,

    tokenTransferGasLimit: 10000,
    nativeTokenTransferGasLimit: 10000,

    estimatedGasFeeBaseAmount: 10000,
    estimatedGasFeeMultiplierFactor: expandDecimals(1, 30),

    executionGasFeeBaseAmount: 10000,
    executionGasFeeMultiplierFactor: expandDecimals(1, 30),
  };
}
