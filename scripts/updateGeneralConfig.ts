import hre from "hardhat";

import { encodeData } from "../utils/hash";
import { bigNumberify } from "../utils/math";
import { getFullKey, appendUintConfigIfDifferent } from "../utils/config";
import * as keys from "../utils/keys";

const processGeneralConfig = async ({ generalConfig, handleConfig }) => {
  await handleConfig("uint", keys.MAX_UI_FEE_FACTOR, "0x", generalConfig.maxUiFeeFactor, `maxUiFeeFactor`);

  await handleConfig(
    "uint",
    keys.MIN_HANDLE_EXECUTION_ERROR_GAS,
    "0x",
    generalConfig.minHandleExecutionErrorGas,
    `minHandleExecutionErrorGas`
  );

  await handleConfig(
    "uint",
    keys.MAX_CALLBACK_GAS_LIMIT,
    "0x",
    generalConfig.maxCallbackGasLimit,
    `maxCallbackGasLimit`
  );

  await handleConfig("uint", keys.MAX_SWAP_PATH_LENGTH, "0x", generalConfig.maxSwapPathLength, `maxSwapPathLength`);

  await handleConfig("uint", keys.MIN_COLLATERAL_USD, "0x", generalConfig.minCollateralUsd, `minCollateralUsd`);

  await handleConfig("uint", keys.MIN_POSITION_SIZE_USD, "0x", generalConfig.minPositionSizeUsd, `minCollateralUsd`);

  await handleConfig(
    "uint",
    keys.SWAP_FEE_RECEIVER_FACTOR,
    "0x",
    generalConfig.swapFeeReceiverFactor,
    `swapFeeReceiverFactor`
  );

  await handleConfig(
    "uint",
    keys.POSITION_FEE_RECEIVER_FACTOR,
    "0x",
    generalConfig.positionFeeReceiverFactor,
    `positionFeeReceiverFactor`
  );

  await handleConfig(
    "uint",
    keys.DEPOSIT_GAS_LIMIT,
    encodeData(["bool"], [true]),
    generalConfig.depositGasLimitSingle,
    `depositGasLimitSingle`
  );

  await handleConfig(
    "uint",
    keys.DEPOSIT_GAS_LIMIT,
    encodeData(["bool"], [false]),
    generalConfig.depositGasLimitMultiple,
    `depositGasLimitMultiple`
  );

  await handleConfig(
    "uint",
    keys.withdrawalGasLimitKey(),
    "0x",
    generalConfig.withdrawalGasLimit,
    `withdrawalGasLimit`
  );

  await handleConfig(
    "uint",
    keys.singleSwapGasLimitKey(),
    "0x",
    generalConfig.singleSwapGasLimit,
    `singleSwapGasLimit`
  );

  await handleConfig(
    "uint",
    keys.increaseOrderGasLimitKey(),
    "0x",
    generalConfig.increaseOrderGasLimit,
    `increaseOrderGasLimit`
  );

  await handleConfig(
    "uint",
    keys.decreaseOrderGasLimitKey(),
    "0x",
    generalConfig.decreaseOrderGasLimit,
    `decreaseOrderGasLimit`
  );

  await handleConfig("uint", keys.swapOrderGasLimitKey(), "0x", generalConfig.swapOrderGasLimit, `swapOrderGasLimit`);

  await handleConfig(
    "uint",
    keys.NATIVE_TOKEN_TRANSFER_GAS_LIMIT,
    "0x",
    generalConfig.nativeTokenTransferGasLimit,
    `nativeTokenTransferGasLimit`
  );

  await handleConfig(
    "uint",
    keys.ESTIMATED_GAS_FEE_BASE_AMOUNT,
    "0x",
    generalConfig.estimatedGasFeeBaseAmount,
    `estimatedGasFeeBaseAmount`
  );

  await handleConfig(
    "uint",
    keys.ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR,
    "0x",
    generalConfig.estimatedGasFeeMultiplierFactor,
    `estimatedGasFeeMultiplierFactor`
  );

  await handleConfig(
    "uint",
    keys.EXECUTION_GAS_FEE_BASE_AMOUNT,
    "0x",
    generalConfig.executionGasFeeBaseAmount,
    `executionGasFeeBaseAmount`
  );

  await handleConfig(
    "uint",
    keys.EXECUTION_GAS_FEE_MULTIPLIER_FACTOR,
    "0x",
    generalConfig.executionGasFeeMultiplierFactor,
    `executionGasFeeMultiplierFactor`
  );

  await handleConfig(
    "uint",
    keys.REQUEST_EXPIRATION_BLOCK_AGE,
    "0x",
    generalConfig.requestExpirationBlockAge,
    `requestExpirationBlockAge`
  );
};

async function main() {
  const generalConfig = await hre.gmx.getGeneral();

  const dataStore = await hre.ethers.getContract("DataStore");
  const multicall = await hre.ethers.getContract("Multicall3");
  const config = await hre.ethers.getContract("Config");

  const keys = [];
  const multicallReadParams = [];

  await processGeneralConfig({
    generalConfig,
    handleConfig: async (type, baseKey, keyData) => {
      if (type !== "uint") {
        throw new Error("Unsupported type");
      }

      const key = getFullKey(baseKey, keyData);

      keys.push(key);
      multicallReadParams.push({
        target: dataStore.address,
        allowFailure: false,
        callData: dataStore.interface.encodeFunctionData("getUint", [key]),
      });
    },
  });

  const result = await multicall.callStatic.aggregate3(multicallReadParams);
  const dataCache = {};
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const value = result[i].returnData;
    dataCache[key] = bigNumberify(value);
  }

  const multicallWriteParams = [];

  await processGeneralConfig({
    generalConfig,
    handleConfig: async (type, baseKey, keyData, value, label) => {
      if (type !== "uint") {
        throw new Error("Unsupported type");
      }

      await appendUintConfigIfDifferent(multicallWriteParams, dataCache, baseKey, keyData, value, label);
    },
  });

  console.log(`updating ${multicallWriteParams.length} params`);
  console.log("multicallWriteParams", multicallWriteParams);
  await config.multicall(multicallWriteParams);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
