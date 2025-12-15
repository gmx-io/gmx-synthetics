import hre from "hardhat";

import { getExistingContractAddresses } from "../config/overwrite";
import { signExternally } from "../utils/signer";

export async function main() {
  const timelockMethod = process.env.TIMELOCK_METHOD;
  if (!["signalSetHandler", "setHandler"].includes(timelockMethod)) {
    throw new Error(`Unexpected TIMELOCK_METHOD: ${timelockMethod}`);
  }

  const { ReferralStorage: referralStorageInfo } = getExistingContractAddresses(hre.network);

  const referralStorage = await hre.ethers.getContractAt("ReferralStorage", referralStorageInfo.address);

  const govAddress = await referralStorage.gov();

  const gov = await hre.ethers.getContractAt("MockTimelock", govAddress);

  const orderHandler = await hre.ethers.getContract("OrderHandler");
  const jitOrderHandler = await hre.ethers.getContract("JitOrderHandler");
  const multichainOrderRouter = await hre.ethers.getContract("MultichainOrderRouter");

  const multicallWriteParams = [];

  multicallWriteParams.push(
    gov.interface.encodeFunctionData(timelockMethod, [referralStorage.address, orderHandler.address, true])
  );

  multicallWriteParams.push(
    gov.interface.encodeFunctionData(timelockMethod, [referralStorage.address, jitOrderHandler.address, true])
  );

  multicallWriteParams.push(
    gov.interface.encodeFunctionData(timelockMethod, [referralStorage.address, multichainOrderRouter.address, true])
  );

  multicallWriteParams.push(gov.interface.encodeFunctionData("setKeeper", [multichainOrderRouter.address, true]));

  await signExternally(await gov.populateTransaction.multicall(multicallWriteParams));
}

main().catch((ex) => {
  console.error(ex);
  process.exit(1);
});
