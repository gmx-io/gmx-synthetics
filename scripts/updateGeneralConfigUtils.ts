import hre, { network } from "hardhat";

import { ConfigChangeItem, handleConfigChanges } from "./updateConfigUtils";
import * as keys from "../utils/keys";
import { encodeData } from "../utils/hash";

const getConfigItems = async (generalConfig, oracleConfig) => {
  const configItems: ConfigChangeItem[] = [
    {
      type: "address",
      baseKey: keys.CHAINLINK_PAYMENT_TOKEN,
      value: oracleConfig.chainlinkPaymentToken,
      label: `chainlinkPaymentToken`,
    },
    {
      type: "uint",
      baseKey: keys.SEQUENCER_GRACE_DURATION,
      value: generalConfig.sequencerGraceDuration,
      label: `sequencerGraceDuration`,
    },
    {
      type: "uint",
      baseKey: keys.MAX_UI_FEE_FACTOR,
      value: generalConfig.maxUiFeeFactor,
      label: `maxUiFeeFactor`,
    },
    {
      type: "uint",
      baseKey: keys.MAX_AUTO_CANCEL_ORDERS,
      value: generalConfig.maxAutoCancelOrders,
      label: `maxAutoCancelOrders`,
    },
    {
      type: "uint",
      baseKey: keys.MAX_TOTAL_CALLBACK_GAS_LIMIT_FOR_AUTO_CANCEL_ORDERS,
      value: generalConfig.maxTotalCallbackGasLimitForAutoCancelOrders,
      label: `maxTotalCallbackGasLimitForAutoCancelOrders`,
    },
    {
      type: "uint",
      baseKey: keys.MIN_HANDLE_EXECUTION_ERROR_GAS,
      value: generalConfig.minHandleExecutionErrorGas,
      label: `minHandleExecutionErrorGas`,
    },
    {
      type: "uint",
      baseKey: keys.MIN_HANDLE_EXECUTION_ERROR_GAS_TO_FORWARD,
      value: generalConfig.minHandleExecutionErrorGasToForward,
      label: `minHandleExecutionErrorGasToForward`,
    },
    {
      type: "uint",
      baseKey: keys.MIN_ADDITIONAL_GAS_FOR_EXECUTION,
      value: generalConfig.minAdditionalGasForExecution,
      label: `minAdditionalGasForExecution`,
    },
    {
      type: "uint",
      baseKey: keys.REFUND_EXECUTION_FEE_GAS_LIMIT,
      value: generalConfig.refundExecutionFeeGasLimit,
      label: `refundExecutionFeeGasLimit`,
    },
    {
      type: "uint",
      baseKey: keys.MAX_CALLBACK_GAS_LIMIT,
      value: generalConfig.maxCallbackGasLimit,
      label: `maxCallbackGasLimit`,
    },
    {
      type: "uint",
      baseKey: keys.MAX_SWAP_PATH_LENGTH,
      value: generalConfig.maxSwapPathLength,
      label: `maxSwapPathLength`,
    },
    {
      type: "uint",
      baseKey: keys.MIN_COLLATERAL_USD,
      value: generalConfig.minCollateralUsd,
      label: `minCollateralUsd`,
    },
    {
      type: "uint",
      baseKey: keys.MIN_POSITION_SIZE_USD,
      value: generalConfig.minPositionSizeUsd,
      label: `minPositionSizeUsd`,
    },
    {
      type: "uint",
      baseKey: keys.CLAIMABLE_COLLATERAL_DELAY,
      value: generalConfig.claimableCollateralDelay,
      label: `claimableCollateralDelay`,
    },
    {
      type: "uint",
      baseKey: keys.SWAP_FEE_RECEIVER_FACTOR,
      value: generalConfig.swapFeeReceiverFactor,
      label: `swapFeeReceiverFactor`,
    },
    {
      type: "uint",
      baseKey: keys.POSITION_FEE_RECEIVER_FACTOR,
      value: generalConfig.positionFeeReceiverFactor,
      label: `positionFeeReceiverFactor`,
    },
    {
      type: "uint",
      baseKey: keys.LIQUIDATION_FEE_RECEIVER_FACTOR,
      value: generalConfig.liquidationFeeReceiverFactor,
      label: `liquidationFeeReceiverFactor`,
    },
    {
      type: "uint",
      baseKey: keys.DEPOSIT_GAS_LIMIT,
      value: generalConfig.depositGasLimit,
      label: `depositGasLimit`,
    },
    {
      type: "uint",
      baseKey: keys.CREATE_DEPOSIT_GAS_LIMIT,
      value: generalConfig.createDepositGasLimit,
      label: `createDepositGasLimit`,
    },
    {
      type: "uint",
      baseKey: keys.CREATE_GLV_DEPOSIT_GAS_LIMIT,
      value: generalConfig.createGlvDepositGasLimit,
      label: `createGlvDepositGasLimit`,
    },
    {
      type: "uint",
      baseKey: keys.CREATE_WITHDRAWAL_GAS_LIMIT,
      value: generalConfig.createWithdrawalGasLimit,
      label: `createWithdrawalGasLimit`,
    },
    {
      type: "uint",
      baseKey: keys.CREATE_GLV_WITHDRAWAL_GAS_LIMIT,
      value: generalConfig.createGlvWithdrawalGasLimit,
      label: `createGlvWithdrawalGasLimit`,
    },
    {
      type: "uint",
      baseKey: keys.WITHDRAWAL_GAS_LIMIT,
      value: generalConfig.withdrawalGasLimit,
      label: `withdrawalGasLimit`,
    },
    {
      type: "uint",
      baseKey: keys.shiftGasLimitKey(),
      value: generalConfig.shiftGasLimit,
      label: `shiftGasLimit`,
    },
    {
      type: "uint",
      baseKey: keys.singleSwapGasLimitKey(),
      value: generalConfig.singleSwapGasLimit,
      label: `singleSwapGasLimit`,
    },
    {
      type: "uint",
      baseKey: keys.increaseOrderGasLimitKey(),
      value: generalConfig.increaseOrderGasLimit,
      label: `increaseOrderGasLimit`,
    },
    {
      type: "uint",
      baseKey: keys.decreaseOrderGasLimitKey(),
      value: generalConfig.decreaseOrderGasLimit,
      label: `decreaseOrderGasLimit`,
    },
    {
      type: "uint",
      baseKey: keys.swapOrderGasLimitKey(),
      value: generalConfig.swapOrderGasLimit,
      label: `swapOrderGasLimit`,
    },
    {
      type: "uint",
      baseKey: keys.NATIVE_TOKEN_TRANSFER_GAS_LIMIT,
      value: generalConfig.nativeTokenTransferGasLimit,
      label: `nativeTokenTransferGasLimit`,
    },
    {
      type: "uint",
      baseKey: keys.swapOrderGasLimitKey(),
      value: generalConfig.swapOrderGasLimit,
      label: `swapOrderGasLimit`,
    },
    {
      type: "uint",
      baseKey: keys.MAX_EXECUTION_FEE_MULTIPLIER_FACTOR,
      value: generalConfig.maxExecutionFeeMultiplierFactor,
      label: `maxExecutionFeeMultiplierFactor`,
    },
    {
      type: "uint",
      baseKey: keys.GELATO_RELAY_FEE_BASE_AMOUNT,
      value: generalConfig.gelatoRelayFeeBaseAmount,
      label: `gelatoRelayFeeBaseAmount`,
    },
    {
      type: "uint",
      baseKey: keys.GELATO_RELAY_FEE_MULTIPLIER_FACTOR,
      value: generalConfig.gelatoRelayFeeMultiplierFactor,
      label: `gelatoRelayFeeMultiplierFactor`,
    },
    {
      type: "address",
      baseKey: keys.RELAY_FEE_ADDRESS,
      value: generalConfig.relayFeeAddress,
      label: `relayFeeAddress`,
    },
    {
      type: "uint",
      baseKey: keys.MAX_RELAY_FEE_SWAP_USD_FOR_SUBACCOUNT,
      value: generalConfig.maxRelayFeeUsdForSubaccount,
      label: `maxRelayFeeUsdForSubaccount`,
    },
    {
      type: "uint",
      baseKey: keys.MAX_DATA_LENGTH,
      value: generalConfig.maxDataLength,
      label: `maxDataLength`,
    },
    {
      type: "uint",
      baseKey: keys.ORACLE_PROVIDER_MIN_CHANGE_DELAY,
      value: generalConfig.oracleProviderMinChangeDelay,
      label: `oracleProviderMinChangeDelay`,
    },
  ];

  if (hre.network.name !== "avalanche" || process.env.SKIP_GLV_LIMITS_AVALANCHE !== "true") {
    configItems.push({
      type: "uint",
      baseKey: keys.glvPerMarketGasLimitKey(),
      value: generalConfig.glvPerMarketGasLimit,
      label: `glvPerMarketGasLimit`,
    });
    configItems.push({
      type: "uint",
      baseKey: keys.glvDepositGasLimitKey(),
      value: generalConfig.glvDepositGasLimit,
      label: `glvDepositGasLimit`,
    });
    configItems.push({
      type: "uint",
      baseKey: keys.glvWithdrawalGasLimitKey(),
      value: generalConfig.glvWithdrawalGasLimit,
      label: `glvWithdrawalGasLimit`,
    });
    configItems.push({
      type: "uint",
      baseKey: keys.glvShiftGasLimitKey(),
      value: generalConfig.glvShiftGasLimit,
      label: `glvShiftGasLimit`,
    });
  }

  if (generalConfig.estimatedGasFeeBaseAmount) {
    if (network.name === "arbitrum") {
      throw new Error("estimatedGasFeeBaseAmount should be updated in a separate keeper");
    }

    configItems.push({
      type: "uint",
      baseKey: keys.ESTIMATED_GAS_FEE_BASE_AMOUNT_V2_1,
      value: generalConfig.estimatedGasFeeBaseAmount,
      label: `estimatedGasFeeBaseAmount`,
    });
  }

  if (generalConfig.estimatedGasPerOraclePrice) {
    if (network.name === "arbitrum") {
      throw new Error("estimatedGasPerOraclePrice should be updated in a separate keeper");
    }

    configItems.push({
      type: "uint",
      baseKey: keys.ESTIMATED_GAS_FEE_PER_ORACLE_PRICE,
      value: generalConfig.estimatedGasPerOraclePrice,
      label: `estimatedGasPerOraclePrice`,
    });
  }

  if (generalConfig.estimatedGasFeeMultiplierFactor) {
    configItems.push({
      type: "uint",
      baseKey: keys.ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR,
      value: generalConfig.estimatedGasFeeMultiplierFactor,
      label: `estimatedGasFeeMultiplierFactor`,
    });
  }

  if (generalConfig.executionGasFeeBaseAmount) {
    if (network.name === "arbitrum") {
      throw new Error("executionGasFeeBaseAmount should be updated in a separate keeper");
    }

    configItems.push({
      type: "uint",
      baseKey: keys.EXECUTION_GAS_FEE_BASE_AMOUNT_V2_1,
      value: generalConfig.executionGasFeeBaseAmount,
      label: `executionGasFeeBaseAmount`,
    });
  }

  if (generalConfig.executionGasPerOraclePrice) {
    if (network.name === "arbitrum") {
      throw new Error("executionGasPerOraclePrice should be updated in a separate keeper");
    }

    configItems.push({
      type: "uint",
      baseKey: keys.EXECUTION_GAS_FEE_PER_ORACLE_PRICE,
      value: generalConfig.executionGasPerOraclePrice,
      label: `executionGasPerOraclePrice`,
    });
  }

  if (generalConfig.executionGasFeeMultiplierFactor) {
    configItems.push({
      type: "uint",
      baseKey: keys.EXECUTION_GAS_FEE_MULTIPLIER_FACTOR,
      value: generalConfig.executionGasFeeMultiplierFactor,
      label: `executionGasFeeMultiplierFactor`,
    });
  }

  if (generalConfig.requestExpirationTime !== undefined) {
    configItems.push({
      type: "uint",
      baseKey: keys.REQUEST_EXPIRATION_TIME,
      value: generalConfig.requestExpirationTime,
      label: `requestExpirationTime`,
    });
  }

  const layerZeroProvider = await hre.ethers.getContract("LayerZeroProvider");
  configItems.push({
    type: "bool",
    baseKey: keys.IS_RELAY_FEE_EXCLUDED,
    keyData: encodeData(["address"], [layerZeroProvider.address]),
    value: true,
    label: `isRelayFeeExcluded ${layerZeroProvider.address}`,
  });

  if (network.name != "hardhat") {
    for (const [multichainProvider, enabled] of Object.entries(generalConfig.multichainProviders)) {
      configItems.push({
        type: "bool",
        baseKey: keys.IS_MULTICHAIN_PROVIDER_ENABLED,
        keyData: encodeData(["address"], [multichainProvider]),
        value: enabled,
        label: `multichainProvider ${multichainProvider}`,
      });
    }
    for (const [multichainEndpoint, enabled] of Object.entries(generalConfig.multichainEndpoints)) {
      configItems.push({
        type: "bool",
        baseKey: keys.IS_MULTICHAIN_ENDPOINT_ENABLED,
        keyData: encodeData(["address"], [multichainEndpoint]),
        value: enabled,
        label: `multichainEndpoint ${multichainEndpoint}`,
      });
    }
    for (const [srcChainId, enabled] of Object.entries(generalConfig.srcChainIds)) {
      configItems.push({
        type: "bool",
        baseKey: keys.IS_SRC_CHAIN_ID_ENABLED,
        keyData: encodeData(["uint"], [srcChainId]),
        value: enabled,
        label: `srcChainId ${srcChainId}`,
      });
    }
    for (const [srcChainId, eid] of Object.entries(generalConfig.eids as Record<number, number>)) {
      configItems.push({
        type: "uint",
        baseKey: keys.EID_TO_SRC_CHAIN_ID,
        keyData: encodeData(["uint"], [eid]),
        value: srcChainId,
        label: `eid ${eid} for chainId ${srcChainId}`,
      });
    }
  }

  return configItems;
};

export async function updateGeneralConfig({ write }) {
  const generalConfig = await hre.gmx.getGeneral();
  const oracleConfig = await hre.gmx.getOracle();

  const items = await getConfigItems(generalConfig, oracleConfig);
  await handleConfigChanges(items, write);
}
