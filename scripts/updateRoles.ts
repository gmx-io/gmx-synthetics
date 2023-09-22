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
    avalanche: [
      {
        role: "CONTROLLER",
        member: "0x7309223e21dc2ffbb660e5bd5abf95ae06ba4da0",
      },
      {
        role: "CONTROLLER",
        member: "0x4db91a1fa4ba3c75510b2885d7d7da48e0209f38",
      },
      {
        role: "CONTROLLER",
        member: "0x090fa7eb8b4647dadbea315e68f8f88e8e62bd54",
      },
      {
        role: "CONTROLLER",
        member: "0xee027373517a6d96fe62f70e9a0a395cb5a39eee",
      },
      {
        role: "CONTROLLER",
        member: "0x5c5dbbcdf420b5d81d4ffdba5b26eb24e6e60d52",
      },
      {
        role: "CONTROLLER",
        member: "0x72fa3978e2e330c7b2debc23cb676a3ae63333f6",
      },
      {
        role: "CONTROLLER",
        member: "0x790ee987b9b253374d700b07f16347a7d4c4ff2e",
      },
      {
        role: "CONTROLLER",
        member: "0xd3b6e962f135634c43415d57a28e688fb4f15a58",
      },
      {
        role: "CONTROLLER",
        member: "0x11e590f6092d557bf71baded50d81521674f8275",
      },
      {
        role: "CONTROLLER",
        member: "0xc7d8e3561f1247ebda491ba5f042699c2807c33c",
      },
      {
        role: "CONTROLLER",
        member: "0x931c18af613f56289253f0eed57f315de7dbafcd",
      },
      {
        role: "ROLE_ADMIN",
        member: "0x4db91a1fa4ba3c75510b2885d7d7da48e0209f38",
      },
      {
        role: "ROUTER_PLUGIN",
        member: "0x11e590f6092d557bf71baded50d81521674f8275",
      },
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
