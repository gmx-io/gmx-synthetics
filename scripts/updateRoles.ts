import hre from "hardhat";
import { getFrameSigner } from "../utils/signer";
import { contractAt } from "../utils/deploy";
import { hashString } from "../utils/hash";

const expectedTimelockMethods = [
  "signalGrantRole",
  "grantRoleAfterSignal",
  "signalRevokeRole",
  "revokeRoleAfterSignal",
];

async function getTimelock({ signer }) {
  const network = hre.network.name;

  if (network === "arbitrum") {
    return await contractAt("Timelock", "0x62aB76Ed722C507f297f2B97920dCA04518fe274", signer);
  }

  if (network === "avalanche") {
    return await contractAt("Timelock", "0x4Db91a1Fa4ba3c75510B2885d7d7da48E0209F38", signer);
  }

  throw new Error("Unsupported network");
}

// update roles in config/roles.ts
// then run scripts/validateRoles.ts, it should output the role changes
// update rolesToAdd and rolesToRemove here
// then run e.g. TIMELOCK_METHOD=signalGrantRole npx hardhat run --network arbitrum scripts/updateRoles.ts
async function main() {
  const signer = await getFrameSigner();
  // NOTE: the existing Timelock needs to be used to grant roles to new contracts including new Timelocks
  const timelock = await getTimelock({ signer });

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

  const rolesToRemove = {
    arbitrum: [
      {
        role: "CONTROLLER",
        member: "0x9d44B89Eb6FB382b712C562DfaFD8825829b422e",
      },
      {
        role: "CONTROLLER",
        member: "0xB665B6dBB45ceAf3b126cec98aDB1E611b6a6aea",
      },
      {
        role: "CONTROLLER",
        member: "0x8921e1B2FB2e2b95F1dF68A774BC523327E98E9f",
      },
      {
        role: "CONTROLLER",
        member: "0x3B070aA6847bd0fB56eFAdB351f49BBb7619dbc2",
      },
      {
        role: "CONTROLLER",
        member: "0xf86aE903B5866bCf8723B9C3642758C87f2F3Ef2",
      },
      {
        role: "CONTROLLER",
        member: "0x51e210dC8391728E2017B2Ec050e40b2f458090e",
      },
      {
        role: "CONTROLLER",
        member: "0x79B99855676dB97e488F33CF52DaCF552102A950",
      },
      {
        role: "CONTROLLER",
        member: "0xD9AebEA68DE4b4A3B58833e1bc2AEB9682883AB0",
      },
      {
        role: "CONTROLLER",
        member: "0x12CA21bd73b5887f4d2A0054Ca52510523f18c60",
      },
      {
        role: "CONTROLLER",
        member: "0xD795E1894DD5ac85072c986D3eB9ABA410998696",
      },
      {
        role: "CONTROLLER",
        member: "0x9f5982374e63e5B011317451a424bE9E1275a03f",
      },
      {
        role: "ROLE_ADMIN",
        member: "0x9d44B89Eb6FB382b712C562DfaFD8825829b422e",
      },
      {
        role: "ROUTER_PLUGIN",
        member: "0x3B070aA6847bd0fB56eFAdB351f49BBb7619dbc2",
      },
    ],
    avalanche: [
      {
        role: "CONTROLLER",
        member: "0x768c0E31CC87eF5e2c3E2cdB85A4B34148cC63E5",
      },
      {
        role: "ROLE_ADMIN",
        member: "0x768c0E31CC87eF5e2c3E2cdB85A4B34148cC63E5",
      },
    ],
  };

  const multicallWriteParams = [];

  const timelockMethod = process.env.TIMELOCK_METHOD;
  if (!expectedTimelockMethods.includes(timelockMethod)) {
    throw new Error(`Unexpected TIMELOCK_METHOD: ${timelockMethod}`);
  }

  if (["signalGrantRole", "grantRoleAfterSignal"].includes(timelockMethod)) {
    for (const { member, role } of rolesToAdd[hre.network.name]) {
      multicallWriteParams.push(timelock.interface.encodeFunctionData(timelockMethod, [member, hashString(role)]));
    }
  }

  if (timelockMethod === "signalRevokeRole") {
    for (const { member, role } of rolesToRemove[hre.network.name]) {
      multicallWriteParams.push(timelock.interface.encodeFunctionData(timelockMethod, [member, hashString(role)]));
      // signalGrantRole in case the revocation of the role needs to be reverted
      multicallWriteParams.push(timelock.interface.encodeFunctionData("signalGrantRole", [member, hashString(role)]));
    }
  }

  if (timelockMethod === "revokeRoleAfterSignal") {
    for (const { member, role } of rolesToRemove[hre.network.name]) {
      multicallWriteParams.push(timelock.interface.encodeFunctionData(timelockMethod, [member, hashString(role)]));
    }
  }

  console.log(`updating ${multicallWriteParams.length} roles`);
  console.log("multicallWriteParams", multicallWriteParams);

  if (process.env.WRITE === "true") {
    if (multicallWriteParams.length === 0) {
      throw new Error("multicallWriteParams is empty");
    }

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
