import hre from "hardhat";
import { getFrameSigner } from "../utils/signer";
import { contractAt } from "../utils/deploy";
import { hashString } from "../utils/hash";

const expectedTimelockMethods = ["signalGrantRole", "grantRoleAfterSignal"];

async function main() {
  const signer = await getFrameSigner();
  // NOTE: the existing Timelock needs to be used to grant roles to new contracts including new Timelocks
  const timelock = await contractAt("Timelock", "0x9d44B89Eb6FB382b712C562DfaFD8825829b422e", signer);

  const rolesToAdd = {
    arbitrum: [
      {
        role: "TIMELOCK_ADMIN",
        member: "0xe014cbd60a793901546178e1c16ad9132c927483",
      },
    ],
  };

  const multicallWriteParams = [];

  const timelockMethod = process.env.TIMELOCK_METHOD;
  if (!expectedTimelockMethods.includes(timelockMethod)) {
    throw new Error(`Unexpected TIMELOCK_METHOD: ${timelockMethod}`);
  }

  for (const { member, role } of rolesToAdd[hre.network.name]) {
    multicallWriteParams.push(timelock.interface.encodeFunctionData(timelockMethod, [member, hashString(role)]));
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
