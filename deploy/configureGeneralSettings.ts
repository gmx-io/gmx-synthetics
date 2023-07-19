import { HardhatRuntimeEnvironment } from "hardhat/types";
import * as keys from "../utils/keys";
import { setAddressIfDifferent, setUintIfDifferent, setBoolIfDifferent } from "../utils/dataStore";

const func = async ({ gmx }: HardhatRuntimeEnvironment) => {
  const generalConfig = await gmx.getGeneral();

  await setAddressIfDifferent(keys.FEE_RECEIVER, generalConfig.feeReceiver, "fee receiver");
  await setAddressIfDifferent(keys.HOLDING_ADDRESS, generalConfig.holdingAddress, "holding address");
  await setUintIfDifferent(keys.MAX_UI_FEE_FACTOR, generalConfig.maxUiFeeFactor, "maxUiFeeFactor");

  await setUintIfDifferent(
    keys.MIN_HANDLE_EXECUTION_ERROR_GAS,
    generalConfig.minHandleExecutionErrorGas,
    "min handle execution error gas"
  );

  await setUintIfDifferent(keys.MAX_CALLBACK_GAS_LIMIT, generalConfig.maxCallbackGasLimit, "max callback gas limit");
  await setUintIfDifferent(keys.MAX_SWAP_PATH_LENGTH, generalConfig.maxSwapPathLength, "max swap path length");

  await setUintIfDifferent(keys.MIN_COLLATERAL_USD, generalConfig.minCollateralUsd, "min collateral USD");
  await setUintIfDifferent(keys.MIN_POSITION_SIZE_USD, generalConfig.minPositionSizeUsd, "min position size USD");

  await setUintIfDifferent(keys.SWAP_FEE_RECEIVER_FACTOR, generalConfig.swapFeeReceiverFactor, "swapFeeReceiverFactor");

  await setUintIfDifferent(
    keys.POSITION_FEE_RECEIVER_FACTOR,
    generalConfig.positionFeeReceiverFactor,
    "positionFeeReceiverFactor"
  );

  await setUintIfDifferent(
    keys.BORROWING_FEE_RECEIVER_FACTOR,
    generalConfig.borrowingFeeReceiverFactor,
    "borrowingFeeReceiverFactor"
  );

  await setUintIfDifferent(
    keys.CLAIMABLE_COLLATERAL_TIME_DIVISOR,
    generalConfig.claimableCollateralTimeDivisor,
    "claimable collateral time divisor"
  );

  await setUintIfDifferent(
    keys.depositGasLimitKey(true),
    generalConfig.depositGasLimitSingle,
    "deposit gas limit single"
  );

  await setUintIfDifferent(
    keys.depositGasLimitKey(false),
    generalConfig.depositGasLimitMultiple,
    "deposit gas limit multiple"
  );

  await setUintIfDifferent(keys.withdrawalGasLimitKey(), generalConfig.withdrawalGasLimit, "withdrawal gas limit");

  await setUintIfDifferent(keys.singleSwapGasLimitKey(), generalConfig.singleSwapGasLimit, "single swap gas limit");

  await setUintIfDifferent(
    keys.increaseOrderGasLimitKey(),
    generalConfig.increaseOrderGasLimit,
    "increase order gas limit"
  );

  await setUintIfDifferent(
    keys.decreaseOrderGasLimitKey(),
    generalConfig.decreaseOrderGasLimit,
    "decrease order gas limit"
  );

  await setUintIfDifferent(keys.swapOrderGasLimitKey(), generalConfig.swapOrderGasLimit, "swap order gas limit");

  await setUintIfDifferent(
    keys.NATIVE_TOKEN_TRANSFER_GAS_LIMIT,
    generalConfig.nativeTokenTransferGasLimit,
    "native token transfer gas limit"
  );

  await setUintIfDifferent(
    keys.ESTIMATED_GAS_FEE_BASE_AMOUNT,
    generalConfig.estimatedGasFeeBaseAmount,
    "estimated gas fee base amount"
  );

  await setUintIfDifferent(
    keys.ESTIMATED_GAS_FEE_MULTIPLIER_FACTOR,
    generalConfig.estimatedGasFeeMultiplierFactor,
    "estimated gas fee multiplier factor"
  );

  await setUintIfDifferent(
    keys.EXECUTION_GAS_FEE_BASE_AMOUNT,
    generalConfig.executionGasFeeBaseAmount,
    "execution gas fee base amount"
  );

  await setUintIfDifferent(
    keys.EXECUTION_GAS_FEE_MULTIPLIER_FACTOR,
    generalConfig.executionGasFeeMultiplierFactor,
    "execution gas fee multiplier factor"
  );

  await setBoolIfDifferent(
    keys.SKIP_BORROWING_FEE_FOR_SMALLER_SIDE,
    generalConfig.skipBorrowingFeeForSmallerSide,
    "skip borrowing fee for smaller side"
  );

  if (generalConfig.requestExpirationBlockAge !== undefined) {
    await setUintIfDifferent(
      keys.REQUEST_EXPIRATION_BLOCK_AGE,
      generalConfig.requestExpirationBlockAge,
      "request expiration block age"
    );
  }
};

func.tags = ["GeneralSettings"];
func.dependencies = ["DataStore"];
export default func;
