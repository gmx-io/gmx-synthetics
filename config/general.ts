import { HardhatRuntimeEnvironment } from "hardhat/types";
import { decimalToFloat, percentageToFloat, expandDecimals } from "../utils/math";

export default async function ({ network }: HardhatRuntimeEnvironment) {
  if (network.name === "hardhat") {
    // Note that this is only for the hardhat config
    return {
      feeReceiver: ethers.constants.AddressZero,
      holdingAddress: ethers.constants.AddressZero,
      maxUiFeeFactor: decimalToFloat(5, 5), // 0.005%
      maxAutoCancelOrders: 5,
      maxTotalCallbackGasLimitForAutoCancelOrders: 5_000_000,
      minHandleExecutionErrorGas: 1_200_000,
      minHandleExecutionErrorGasToForward: 1_000_000,
      minAdditionalGasForExecution: 1_000_000,

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

      requestExpirationTime: 300,

      maxSwapPathLength: 5,
      maxCallbackGasLimit: 2_000_000,
      minCollateralUsd: decimalToFloat(1),

      minPositionSizeUsd: decimalToFloat(1),
      claimableCollateralTimeDivisor: 60 * 60,

      positionFeeReceiverFactor: 0,
      swapFeeReceiverFactor: 0,
      borrowingFeeReceiverFactor: 0,

      skipBorrowingFeeForSmallerSide: false,
    };
  }

  const generalConfig = {
    feeReceiver: "0x43ce1d475e06c65dd879f4ec644b8e0e10ff2b6d",
    holdingAddress: "0x3f59203ea1c66527422998b54287e1efcacbe2c5",
    maxUiFeeFactor: percentageToFloat("0.05%"),
    maxAutoCancelOrders: 5,
    minHandleExecutionErrorGas: 1_200_000,
    minHandleExecutionErrorGasToForward: 1_000_000, // measured gas required for an order cancellation: ~600,000
    minAdditionalGasForExecution: 1_000_000,

    depositGasLimitSingle: 1_500_000,
    depositGasLimitMultiple: 1_800_000,
    withdrawalGasLimit: 1_500_000,

    singleSwapGasLimit: 1_000_000, // measured gas required for a swap in a market increase order: ~600,000
    increaseOrderGasLimit: 4_000_000,
    decreaseOrderGasLimit: 4_000_000,
    swapOrderGasLimit: 3_000_000,

    tokenTransferGasLimit: 200_000,
    nativeTokenTransferGasLimit: 50_000,

    estimatedGasFeeBaseAmount: 500_000, // measured gas for an order execution without any main logic: ~500,000
    estimatedGasFeeMultiplierFactor: expandDecimals(1, 30), // 1x

    executionGasFeeBaseAmount: 500_000, // measured gas for an order execution without any main logic: ~500,000
    executionGasFeeMultiplierFactor: expandDecimals(1, 30), // 1x

    maxSwapPathLength: 3,
    maxCallbackGasLimit: 2_000_000,
    minCollateralUsd: decimalToFloat(1),

    minPositionSizeUsd: decimalToFloat(1),
    claimableCollateralTimeDivisor: 60 * 60,

    positionFeeReceiverFactor: decimalToFloat(37, 2), // 37%
    swapFeeReceiverFactor: decimalToFloat(37, 2), // 37%
    borrowingFeeReceiverFactor: decimalToFloat(37, 2), // 37%

    skipBorrowingFeeForSmallerSide: true,
  };

  const networkConfig = {
    arbitrumGoerli: {
      requestExpirationTime: 300,
    },
    arbitrumSepolia: {
      requestExpirationTime: 300,
      maxAutoCancelOrders: 10,
      maxTotalCallbackGasLimitForAutoCancelOrders: 10_000_000,
    },
    avalancheFuji: {
      requestExpirationTime: 300,
    },
    arbitrum: {
      maxAutoCancelOrders: 10,
      maxTotalCallbackGasLimitForAutoCancelOrders: 10_000_000,
      maxCallbackGasLimit: 3_000_000,
      requestExpirationTime: 300,
      estimatedGasFeeBaseAmount: false,
      executionGasFeeBaseAmount: false,
    },
    avalanche: {
      requestExpirationTime: 300,
      estimatedGasFeeBaseAmount: 1_500_000,
      executionGasFeeBaseAmount: 1_500_000,
    },
  }[network.name];

  if (!networkConfig) {
    throw new Error(`Network config not defined for ${network.name}`);
  }

  return { ...generalConfig, ...networkConfig };
}
