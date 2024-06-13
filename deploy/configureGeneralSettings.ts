import { HardhatRuntimeEnvironment } from "hardhat/types";
import * as keys from "../utils/keys";
import { setAddressIfDifferent, setUintIfDifferent, setBoolIfDifferent } from "../utils/dataStore";
import { updateGeneralConfig } from "../scripts/updateGeneralConfigUtils";

const func = async ({ gmx }: HardhatRuntimeEnvironment) => {
  const write = process.env.FOR_EXISTING_MAINNET_DEPLOYMENT ? false : true;
  await updateGeneralConfig({ write });

  const generalConfig = await gmx.getGeneral();

  await setAddressIfDifferent(keys.FEE_RECEIVER, generalConfig.feeReceiver, "fee receiver");
  await setAddressIfDifferent(keys.HOLDING_ADDRESS, generalConfig.holdingAddress, "holding address");

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
};

func.tags = ["GeneralSettings"];
func.dependencies = ["DataStore", "Config", "Multicall", "Roles"];
export default func;
