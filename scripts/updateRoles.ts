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
        role: "CONTROLLER",
        member: "0x226ed647c6ea2c0ce4c08578e2f37b8c2f922849",
      },
      {
        role: "CONTROLLER",
        member: "0x62ab76ed722c507f297f2b97920dca04518fe274",
      },
      {
        role: "CONTROLLER",
        member: "0xa11b501c2dd83acd29f6727570f2502faaa617f2",
      },
      {
        role: "CONTROLLER",
        member: "0xf6b804f6cc847a22f2d022c9b0373190850be34d",
      },
      {
        role: "CONTROLLER",
        member: "0x8514fc704317057fa86961ba9b9490956993a5ed",
      },
      {
        role: "CONTROLLER",
        member: "0x9dc4f12eb2d8405b499fb5b8af79a5f64ab8a457",
      },
      {
        role: "CONTROLLER",
        member: "0x9e32088f3c1a5eb38d32d1ec6ba0bcbf499dc9ac",
      },
      {
        role: "CONTROLLER",
        member: "0x352f684ab9e97a6321a13cf03a61316b681d9fd2",
      },
      {
        role: "CONTROLLER",
        member: "0x7c68c7866a64fa2160f78eeae12217ffbf871fa8",
      },
      {
        role: "CONTROLLER",
        member: "0xbf56a2f030c3f920f0e2ad9cf456b9954c49383a",
      },
      {
        role: "CONTROLLER",
        member: "0x9e0521c3dbb18e849f4955087e065e5c9c879917",
      },
      {
        role: "ROLE_ADMIN",
        member: "0x62ab76ed722c507f297f2b97920dca04518fe274",
      },
      {
        role: "ROUTER_PLUGIN",
        member: "0x7c68c7866a64fa2160f78eeae12217ffbf871fa8",
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
