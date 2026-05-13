import hre from "hardhat";

import { getExistingContractAddresses } from "../config/overwrite";
import { signExternally } from "../utils/signer";

export async function main() {
  const { ReferralStorage: referralStorageInfo } = getExistingContractAddresses(hre.network);
  const referralStorage = await hre.ethers.getContractAt("ReferralStorage", referralStorageInfo.address);

  const govAddress = await referralStorage.gov();
  const gov = await hre.ethers.getContractAt("MockTimelockV1", govAddress);

  const multichainOrderRouter = await hre.ethers.getContract("MultichainOrderRouter");
  if (await gov.isKeeper(multichainOrderRouter.address)) {
    console.log("MultichainOrderRouter is already a keeper.");
    return;
  }

  console.log("\n=== Safe Tx Builder params ===");
  console.log(`To Address:                ${govAddress} (ReferralStorageTimelock)`);
  console.log(`Contract Method Selector:  setKeeper`);
  console.log(`_keeper (address):         ${multichainOrderRouter.address} (MultichainOrderRouter)`);
  console.log(`_isActive (bool):          true\n`);

  await signExternally(await gov.populateTransaction.setKeeper(multichainOrderRouter.address, true));
}

main().catch((ex) => {
  console.error(ex);
  process.exit(1);
});
