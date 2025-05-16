import { ethers } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { decimalToFloat, percentageToFloat, expandDecimals } from "../utils/math";

export default async function ({ network }: HardhatRuntimeEnvironment) {
  if (network.name === "hardhat") {
    // Note that this is only for the hardhat config, the config for all
    // other networks is separate from this
    return {
      feeReceiver: ethers.constants.AddressZero,
      holdingAddress: ethers.constants.AddressZero,
      sequencerUptimeFeed: ethers.constants.AddressZero,
      sequencerGraceDuration: 300,
      maxUiFeeFactor: decimalToFloat(5, 5), // 0.005%
      maxAutoCancelOrders: 6,
      maxTotalCallbackGasLimitForAutoCancelOrders: 3_000_000,
      minHandleExecutionErrorGas: 1_200_000,
      minHandleExecutionErrorGasToForward: 1_000_000,
      minAdditionalGasForExecution: 1_000_000,
      refundExecutionFeeGasLimit: 200_000,

      depositGasLimit: 0,
      withdrawalGasLimit: 0,
      shiftGasLimit: 2_500_000,

      singleSwapGasLimit: 0,
      increaseOrderGasLimit: 0,
      decreaseOrderGasLimit: 0,
      swapOrderGasLimit: 0,

      glvPerMarketGasLimit: 0,
      glvDepositGasLimit: 0,
      glvWithdrawalGasLimit: 0,
      glvShiftGasLimit: 0,

      tokenTransferGasLimit: 200_000,
      nativeTokenTransferGasLimit: 50_000,

      estimatedGasFeeBaseAmount: 0,
      estimatedGasPerOraclePrice: 0,
      estimatedGasFeeMultiplierFactor: 0,

      executionGasFeeBaseAmount: 0,
      executionGasPerOraclePrice: 0,
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
      liquidationFeeReceiverFactor: 0,

      skipBorrowingFeeForSmallerSide: false,

      maxExecutionFeeMultiplierFactor: decimalToFloat(100),
      oracleProviderMinChangeDelay: 3600,
      configMaxPriceAge: 180,

      gelatoRelayFeeMultiplierFactor: 0,
      gelatoRelayFeeBaseAmount: 0,
      relayFeeAddress: ethers.constants.AddressZero,
      maxRelayFeeUsdForSubaccount: 0,
    };
  }

  const generalConfig = {
    feeReceiver: "0x43ce1d475e06c65dd879f4ec644b8e0e10ff2b6d",
    holdingAddress: "0x3f59203ea1c66527422998b54287e1efcacbe2c5",
    sequencerUptimeFeed: ethers.constants.AddressZero,
    sequencerGraceDuration: 300,
    maxUiFeeFactor: percentageToFloat("0.1%"),
    maxAutoCancelOrders: 6,
    maxTotalCallbackGasLimitForAutoCancelOrders: 5_000_000,
    minHandleExecutionErrorGas: 1_200_000,
    minHandleExecutionErrorGasToForward: 1_000_000, // measured gas required for an order cancellation: ~600,000
    minAdditionalGasForExecution: 1_000_000,
    refundExecutionFeeGasLimit: 200_000,

    depositGasLimit: 1_800_000,
    withdrawalGasLimit: 1_500_000,
    shiftGasLimit: 2_500_000,

    singleSwapGasLimit: 1_000_000, // measured gas required for a swap in a market increase order: ~600,000
    increaseOrderGasLimit: 4_000_000,
    decreaseOrderGasLimit: 4_000_000,
    swapOrderGasLimit: 3_000_000,

    glvPerMarketGasLimit: 100_000,
    glvDepositGasLimit: 2_000_000,
    glvWithdrawalGasLimit: 2_000_000,
    glvShiftGasLimit: 3_000_000,

    tokenTransferGasLimit: 200_000,
    nativeTokenTransferGasLimit: 50_000,

    estimatedGasFeeBaseAmount: 600_000,
    estimatedGasPerOraclePrice: 250_000,
    estimatedGasFeeMultiplierFactor: expandDecimals(1, 30), // 1x

    executionGasFeeBaseAmount: 600_000,
    executionGasPerOraclePrice: 250_000,
    executionGasFeeMultiplierFactor: expandDecimals(1, 30), // 1x

    requestExpirationTime: 300,

    maxSwapPathLength: 3,
    maxCallbackGasLimit: 2_000_000,
    minCollateralUsd: decimalToFloat(1),

    minPositionSizeUsd: decimalToFloat(1),
    claimableCollateralTimeDivisor: 60 * 60,

    positionFeeReceiverFactor: decimalToFloat(37, 2), // 37%
    swapFeeReceiverFactor: decimalToFloat(37, 2), // 37%
    borrowingFeeReceiverFactor: decimalToFloat(37, 2), // 37%
    liquidationFeeReceiverFactor: decimalToFloat(37, 2), // 37%

    skipBorrowingFeeForSmallerSide: true,

    maxExecutionFeeMultiplierFactor: decimalToFloat(100),
    oracleProviderMinChangeDelay: 3600,
    configMaxPriceAge: 180,

    gelatoRelayFeeMultiplierFactor: percentageToFloat("107%"), // Relay premium 6% + 1% for swapping collected fees and bridging to Polygon
    gelatoRelayFeeBaseAmount: 50000, // 21000 is base gas, ~10k GelatoRelay gas, some logic after the relay fee is calculated
    relayFeeAddress: "0xDA1b841A21FEF1ad1fcd5E19C1a9D682FB675258",
    maxRelayFeeUsdForSubaccount: decimalToFloat(100),
  };

  const networkConfig = {
    arbitrumGoerli: {},
    arbitrumSepolia: {
      maxAutoCancelOrders: 11,
      maxTotalCallbackGasLimitForAutoCancelOrders: 10_000_000,
      multichainProviders: {
        "0x6fddB6270F6c71f31B62AE0260cfa8E2e2d186E0": true, // StargatePoolNative
        "0x543BdA7c6cA4384FE90B1F5929bb851F52888983": true, // StargatePoolUSDC
      },
      multichainEndpoints: {
        "0x6EDCE65403992e310A62460808c4b910D972f10f": true, // LZ Endpoint
      },
      srcChainIds: {
        11155111: true, // Sepolia
        421614: true, // Arbitrum Sepolia
        11155420: true, // Optimism Sepolia
      },
    },
    avalancheFuji: {},
    arbitrum: {
      maxAutoCancelOrders: 11,
      maxTotalCallbackGasLimitForAutoCancelOrders: 10_000_000,
      maxCallbackGasLimit: 4_000_000,
      estimatedGasPerOraclePrice: false,
      executionGasPerOraclePrice: false,
      estimatedGasFeeBaseAmount: false,
      executionGasFeeBaseAmount: false,
      estimatedGasFeeMultiplierFactor: false,
      executionGasFeeMultiplierFactor: false,
      sequencerUptimeFeed: "0xFdB631F5EE196F0ed6FAa767959853A9F217697D",

      increaseOrderGasLimit: 3_000_000,
      decreaseOrderGasLimit: 3_000_000,
      swapOrderGasLimit: 2_500_000,
    },
    avalanche: {
      increaseOrderGasLimit: 3_500_000,
      decreaseOrderGasLimit: 3_500_000,
    },
  }[network.name];

  if (!networkConfig) {
    throw new Error(`Network config not defined for ${network.name}`);
  }

  return { ...generalConfig, ...networkConfig };
}
