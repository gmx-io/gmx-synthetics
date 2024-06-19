import hre from "hardhat";
import { hashString } from "../utils/hash";
import { timelockWriteMulticall } from "../utils/timelock";

const expectedTimelockMethods = [
  "signalGrantRole",
  "grantRoleAfterSignal",
  "signalRevokeRole",
  "revokeRoleAfterSignal",
  "cancelGrantRole",
];

async function getTimelock() {
  const network = hre.network.name;

  if (network === "arbitrum") {
    return await ethers.getContractAt("Timelock", "0x62aB76Ed722C507f297f2B97920dCA04518fe274");
  }

  if (network === "avalanche") {
    return await ethers.getContractAt("Timelock", "0x4Db91a1Fa4ba3c75510B2885d7d7da48E0209F38");
  }

  throw new Error("Unsupported network");
}

async function getGrantRoleActionKeysToCancel({ timelock }) {
  const txHash = process.env.TX;
  if (!txHash) {
    throw new Error(
      "Missing TX env var. Example of usage: `TX=0x123... npx hardhat run scripts/decodeTransactionEvents.ts`"
    );
  }

  console.log("Retrieving transaction %s", txHash);

  const receipt = await hre.ethers.provider.getTransactionReceipt(txHash);
  if (!receipt) {
    throw new Error("Transaction not found");
  }

  const artifact = await hre.deployments.getArtifact("EventEmitter");
  const eventEmitterInterface = new hre.ethers.utils.Interface(artifact.abi);

  const actionKeys = [];
  for (const [i, log] of receipt.logs.entries()) {
    try {
      const parsedLog = eventEmitterInterface.parseLog(log);
      const eventName = parsedLog.args[1];
      if (eventName === "SignalGrantRole") {
        const actionKey = log.topics[2];
        const timestamp = await timelock.pendingActions(actionKey);
        if (timestamp.gt(0)) {
          actionKeys.push(actionKey);
        } else {
          console.warn(`No pending action found for ${actionKey}`);
        }
      }
    } catch (ex) {
      console.info("Can't parse log %s", i, ex);
    }
  }
  console.log("actionKeys", actionKeys);

  return actionKeys;
}

// to update roles
// 1. update roles in config/roles.ts
// 2. then run scripts/validateRoles.ts, it should output the role changes
// 3. update rolesToAdd and rolesToRemove here
// 4. then run e.g. WRITE=true TIMELOCK_METHOD=signalGrantRole npx hardhat run --network arbitrum scripts/updateRoles.ts
// 5. after the timelock delay, run WRITE=true TIMELOCK_METHOD=grantRoleAfterSignal npx hardhat run --network arbitrum scripts/updateRoles.ts
// see utils/signer.ts for steps on how to sign the transactions
async function main() {
  // NOTE: the existing Timelock needs to be used to grant roles to new contracts including new Timelocks
  const timelock = await getTimelock();

  const rolesToAdd = {
    arbitrum: [
      {
        role: "CONTROLLER",
        member: "0xd0db5ea893ad4a89e5dbbd94fbd25f0273bbd74c",
      },
      {
        role: "CONTROLLER",
        member: "0x2ecb664e934acd5df1ee889dbb2e7d6c1d7ce3cb",
      },
      {
        role: "CONTROLLER",
        member: "0xb8fc96d7a413c462f611a7ac0c912c2fe26eabc4",
      },
      {
        role: "CONTROLLER",
        member: "0xb0c681de9cb4b75ed0a620c04a958bc05f4087b7",
      },
      {
        role: "CONTROLLER",
        member: "0x26bc03c944a4800299b4bdfb5edce314dd497511",
      },
      {
        role: "CONTROLLER",
        member: "0x321f3739983cc3e911fd67a83d1ee76238894bd0",
      },
      {
        role: "CONTROLLER",
        member: "0xa19fa3f0d8e7b7a8963420de504b624167e709b2",
      },
      {
        role: "CONTROLLER",
        member: "0xb0fc2a48b873da40e7bc25658e5e6137616ac2ee",
      },
      {
        role: "CONTROLLER",
        member: "0x69c527fc77291722b52649e45c838e41be8bf5d5",
      },
      {
        role: "CONTROLLER",
        member: "0x55e9a5e1aed46500f746f7683e87f3d9f3c1e14e",
      },
      {
        role: "CONTROLLER",
        member: "0x08a902113f7f41a8658ebb1175f9c847bf4fb9d8",
      },
      {
        role: "CONTROLLER",
        member: "0x9f48160edc3ad78f4ca0e3fdf54a75d8fb228452",
      },
      {
        role: "CONTROLLER",
        member: "0x4895170e184441da9bd2bf95c120c07ba628eef0",
      },
      {
        role: "CONTROLLER",
        member: "0xea90ec1228f7d1b3d47d84d1c9d46dbdfeff7709",
      },
    ],
    avalanche: [
      {
        role: "ADL_KEEPER",
        member: "0x8e66ee36f2c7b9461f50aa0b53ef0e4e47f4abbf",
      },
      {
        role: "ADL_KEEPER",
        member: "0x6a2b3a13be0c723674bcfd722d4e133b3f356e05",
      },
      {
        role: "ADL_KEEPER",
        member: "0xdd5c59b7c4e8fad38732caffbebd20a61bf9f3fc",
      },
      {
        role: "ADL_KEEPER",
        member: "0xeb2bb25ddd2b1872d5189ae72fcec9b160dd3fb2",
      },
      {
        role: "CONTROLLER",
        member: "0x8514fc704317057fa86961ba9b9490956993a5ed",
      },
      {
        role: "CONTROLLER",
        member: "0x844d38f2c3875b8351feb4764718e1c64bd55c46",
      },
      {
        role: "CONTROLLER",
        member: "0xad7a7568f500f65aea3d9417a210cbc5dcd7b273",
      },
      {
        role: "CONTROLLER",
        member: "0xb54c8fb6b2f143dd58f5b00fde7da4fa05077b20",
      },
      {
        role: "CONTROLLER",
        member: "0x352f684ab9e97a6321a13cf03a61316b681d9fd2",
      },
      {
        role: "CONTROLLER",
        member: "0xae2453dca7704080052af3c212e862cab50d65c0",
      },
      {
        role: "CONTROLLER",
        member: "0xd1b861b50f8d8f9dd922453d1234a2abdf4d4ea5",
      },
      {
        role: "CONTROLLER",
        member: "0x32a0258007a6ea78265a5ae4dbb28f176be4a8eb",
      },
      {
        role: "CONTROLLER",
        member: "0x3be24aed1a4ccadebf2956e02c27a00726d4327d",
      },
      {
        role: "CONTROLLER",
        member: "0xcf2ffd3fc8d2cf78d087681f9acd35c799e0d88d",
      },
      {
        role: "CONTROLLER",
        member: "0x0e9a0419e5144fe3c73ff30446a1e4d04e1224f0",
      },
      {
        role: "CONTROLLER",
        member: "0xe5485a4fd6527911e9b82a75a1bfed6e47be2241",
      },
      {
        role: "CONTROLLER",
        member: "0x28ad6ff2683a3d36c05f1d9ec95b907086431a27",
      },
      {
        role: "CONTROLLER",
        member: "0x7da618ee7b32af18b749a3715332dbcd820d0913",
      },
      {
        role: "FROZEN_ORDER_KEEPER",
        member: "0x8e66ee36f2c7b9461f50aa0b53ef0e4e47f4abbf",
      },
      {
        role: "FROZEN_ORDER_KEEPER",
        member: "0x6a2b3a13be0c723674bcfd722d4e133b3f356e05",
      },
      {
        role: "FROZEN_ORDER_KEEPER",
        member: "0xdd5c59b7c4e8fad38732caffbebd20a61bf9f3fc",
      },
      {
        role: "FROZEN_ORDER_KEEPER",
        member: "0xeb2bb25ddd2b1872d5189ae72fcec9b160dd3fb2",
      },
      {
        role: "LIMITED_CONFIG_KEEPER",
        member: "0x8e66ee36f2c7b9461f50aa0b53ef0e4e47f4abbf",
      },
      {
        role: "LIMITED_CONFIG_KEEPER",
        member: "0x6a2b3a13be0c723674bcfd722d4e133b3f356e05",
      },
      {
        role: "LIMITED_CONFIG_KEEPER",
        member: "0xdd5c59b7c4e8fad38732caffbebd20a61bf9f3fc",
      },
      {
        role: "LIMITED_CONFIG_KEEPER",
        member: "0xeb2bb25ddd2b1872d5189ae72fcec9b160dd3fb2",
      },
      {
        role: "LIQUIDATION_KEEPER",
        member: "0x8e66ee36f2c7b9461f50aa0b53ef0e4e47f4abbf",
      },
      {
        role: "LIQUIDATION_KEEPER",
        member: "0x6a2b3a13be0c723674bcfd722d4e133b3f356e05",
      },
      {
        role: "LIQUIDATION_KEEPER",
        member: "0xdd5c59b7c4e8fad38732caffbebd20a61bf9f3fc",
      },
      {
        role: "LIQUIDATION_KEEPER",
        member: "0xeb2bb25ddd2b1872d5189ae72fcec9b160dd3fb2",
      },
      {
        role: "ORDER_KEEPER",
        member: "0x8e66ee36f2c7b9461f50aa0b53ef0e4e47f4abbf",
      },
      {
        role: "ORDER_KEEPER",
        member: "0x6a2b3a13be0c723674bcfd722d4e133b3f356e05",
      },
      {
        role: "ORDER_KEEPER",
        member: "0xdd5c59b7c4e8fad38732caffbebd20a61bf9f3fc",
      },
      {
        role: "ORDER_KEEPER",
        member: "0xeb2bb25ddd2b1872d5189ae72fcec9b160dd3fb2",
      },
    ],
  };

  const rolesToRemove = {
    arbitrum: [],
    avalanche: [],
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

  if (timelockMethod === "cancelGrantRole") {
    const actionKeys = await getGrantRoleActionKeysToCancel({ timelock });
    for (const actionKey of actionKeys) {
      multicallWriteParams.push(timelock.interface.encodeFunctionData("cancelAction", [actionKey]));
    }
  }

  console.log(`updating ${multicallWriteParams.length} roles`);
  await timelockWriteMulticall({ timelock, multicallWriteParams });
}

main().catch((ex) => {
  console.error(ex);
  process.exit(1);
});
