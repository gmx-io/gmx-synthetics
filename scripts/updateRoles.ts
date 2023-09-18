import hre from "hardhat";
import { getFrameSigner } from "../utils/signer";

const expectedTimelockMethods = ["signalGrantRole", "grantRoleAfterSignal"];

async function main() {
  const signer = await getFrameSigner();
  const timelock = await hre.ethers.getContract("Timelock", signer);

  const rolesToAdd = [];

  const multicallWriteParams = [];

  const timelockMethod = process.env.TIMELOCK_METHOD;
  if (!expectedTimelockMethods.includes(timelockMethod)) {
    throw new Error(`Unexpected TIMELOCK_METHOD: ${timelockMethod}`);
  }

  for (const { member, role } of rolesToAdd) {
    multicallWriteParams.push(timelock.interface.encodeFunctionData(timelockMethod, [member, role]));
  }

  console.log(`updating ${multicallWriteParams.length} roles`);
  console.log("multicallWriteParams", multicallWriteParams);

  if (process.env.WRITE === "true") {
    await timelock.multicall(multicallWriteParams);
  } else {
    console.log("NOTE: executed in read-only mode, no transactions were sent");
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
