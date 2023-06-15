import { HardhatRuntimeEnvironment } from "hardhat/types";
import { decimalToFloat, expandDecimals } from "../utils/math";

export default async function ({ network }: HardhatRuntimeEnvironment) {
  if (network.name === "hardhat") {
    return {
      feeReceiver: ethers.constants.AddressZero,
      holdingAddress: ethers.constants.AddressZero,
      maxUiFeeFactor: decimalToFloat(5, 5), // 0.005%
      minHandleExecutionErrorGas: 1000000,

      depositGasLimitSingle: 0,
      depositGasLimitMultiple: 0,
      withdrawalGasLimit: 0,

      singleSwapGasLimit: 0,
      increaseOrderGasLimit: 0,
      decreaseOrderGasLimit: 0,
      swapOrderGasLimit: 0,

      tokenTransferGasLimit: 200_000,
      nativeTokenTransferGasLimit: 50_000,

      estimatedGasFeeBaseAmount: 0,
      estimatedGasFeeMultiplierFactor: 0,

      executionGasFeeBaseAmount: 0,
      executionGasFeeMultiplierFactor: 0,

      maxSwapPathLength: 5,
      maxCallbackGasLimit: 2_000_000,
      minCollateralUsd: decimalToFloat(1),

      minPositionSizeUsd: decimalToFloat(1),
      claimableCollateralTimeDivisor: 60 * 60,

      positionFeeReceiverFactor: 0,
      swapFeeReceiverFactor: 0,
      borrowingFeeReceiverFactor: 0,
    };
  } else {
    return {
      feeReceiver: "0x49B373D422BdA4C6BfCdd5eC1E48A9a26fdA2F8b",
      holdingAddress: "0x49B373D422BdA4C6BfCdd5eC1E48A9a26fdA2F8b",
      maxUiFeeFactor: decimalToFloat(5, 5), // 0.005%
      minHandleExecutionErrorGas: 1000000,

      depositGasLimitSingle: 1500000,
      depositGasLimitMultiple: 1800000,
      withdrawalGasLimit: 1500000,

      singleSwapGasLimit: 2500000,
      increaseOrderGasLimit: 4000000,
      decreaseOrderGasLimit: 4000000,
      swapOrderGasLimit: 3000000,

      tokenTransferGasLimit: 200_000,
      nativeTokenTransferGasLimit: 50_000,

      estimatedGasFeeBaseAmount: 10000,
      estimatedGasFeeMultiplierFactor: expandDecimals(1, 30),

      executionGasFeeBaseAmount: 10000,
      executionGasFeeMultiplierFactor: expandDecimals(1, 30),

      maxSwapPathLength: 5,
      maxCallbackGasLimit: 2_000_000,
      minCollateralUsd: decimalToFloat(1),

      minPositionSizeUsd: decimalToFloat(1),
      claimableCollateralTimeDivisor: 60 * 60,

      positionFeeReceiverFactor: decimalToFloat(63, 2), // 63%
      swapFeeReceiverFactor: decimalToFloat(63, 2), // 63%
      borrowingFeeReceiverFactor: decimalToFloat(63, 2), // 63%
    };
  }
}
