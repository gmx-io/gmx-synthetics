import { HardhatRuntimeEnvironment } from "hardhat/types";
import { decimalToFloat, expandDecimals } from "../utils/math";

export default async function ({ network }: HardhatRuntimeEnvironment) {
  if (network.name === "hardhat") {
    return {
      depositGasLimitSingle: 0,
      depositGasLimitMultiple: 0,
      withdrawalGasLimitSingle: 0,
      withdrawalGasLimitMultiple: 0,

      singleSwapGasLimit: 0,
      increaseOrderGasLimit: 0,
      decreaseOrderGasLimit: 0,
      swapOrderGasLimit: 0,

      tokenTransferGasLimit: 0,
      nativeTokenTransferGasLimit: 0,

      estimatedGasFeeBaseAmount: 0,
      estimatedGasFeeMultiplierFactor: 0,

      executionGasFeeBaseAmount: 0,
      executionGasFeeMultiplierFactor: 0,

      maxCallbackGasLimit: 2000000,
      minCollateralUsd: decimalToFloat(1),
      claimableCollateralTimeDivisor: 60 * 60,
    };
  } else {
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

      maxCallbackGasLimit: 2 * 1000 * 1000,
      minCollateralUsd: decimalToFloat(1),
      claimableCollateralTimeDivisor: 60 * 60,
    };
  }
}
