import { HardhatRuntimeEnvironment } from "hardhat/types";
import * as keys from "../utils/keys";
import { setUintIfDifferent } from "../utils/dataStore";

const func = async ({ gmx }: HardhatRuntimeEnvironment) => {
  const generalConfig = await gmx.getGeneral();

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

  await setUintIfDifferent(
    keys.withdrawalGasLimitKey(true),
    generalConfig.withdrawalGasLimitSingle,
    "withdrawal gas limit single"
  );

  await setUintIfDifferent(
    keys.withdrawalGasLimitKey(false),
    generalConfig.withdrawalGasLimitMultiple,
    "withdrawal gas limit multiple"
  );

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
    keys.TOKEN_TRANSFER_GAS_LIMIT,
    generalConfig.tokenTransferGasLimit,
    "token transfer gas limit"
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
};

func.tags = ["GeneralSettings"];
func.dependencies = ["DataStore"];
export default func;
