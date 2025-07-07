import { HardhatRuntimeEnvironment } from "hardhat/types";
import * as keys from "../utils/keys";
import { setAddressIfDifferent, setUintIfDifferent, setBoolIfDifferent } from "../utils/dataStore";
import { updateGeneralConfig } from "../scripts/updateGeneralConfigUtils";

const func = async ({ gmx }: HardhatRuntimeEnvironment) => {
  console.log(1);
  const generalConfig = await gmx.getGeneral();

  console.log(2);
  await setAddressIfDifferent(keys.FEE_RECEIVER, generalConfig.feeReceiver, "fee receiver");
  await setAddressIfDifferent(keys.HOLDING_ADDRESS, generalConfig.holdingAddress, "holding address");

  console.log(3);
  await setUintIfDifferent(
    keys.BORROWING_FEE_RECEIVER_FACTOR,
    generalConfig.borrowingFeeReceiverFactor,
    "borrowingFeeReceiverFactor"
  );

  await setBoolIfDifferent(
    keys.SKIP_BORROWING_FEE_FOR_SMALLER_SIDE,
    generalConfig.skipBorrowingFeeForSmallerSide,
    "skip borrowing fee for smaller side"
  );

  await setUintIfDifferent(
    keys.CLAIMABLE_COLLATERAL_TIME_DIVISOR,
    generalConfig.claimableCollateralTimeDivisor,
    "claimable collateral time divisor"
  );

  await setUintIfDifferent(
    keys.MAX_EXECUTION_FEE_MULTIPLIER_FACTOR,
    generalConfig.maxExecutionFeeMultiplierFactor,
    "max execution fee multiplier factor"
  );

  console.log(4);
  if (!gmx.isExistingMainnetDeployment) {
    console.log(5);
    await updateGeneralConfig({ write: true });
    console.log(6);
  }
};

func.tags = ["GeneralSettings"];
func.dependencies = ["DataStore", "Config", "Multicall", "Roles"];
export default func;
