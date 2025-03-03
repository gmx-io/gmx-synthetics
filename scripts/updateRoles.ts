import hre from "hardhat";
import { hashString } from "../utils/hash";
import { cancelActionById, getGrantRolePayload, getRevokeRolePayload, timelockWriteMulticall } from "../utils/timelock";
import { TimelockConfig } from "../typechain-types";

const expectedTimelockMethods = [
  "signalGrantRole",
  "grantRoleAfterSignal",
  "signalRevokeRole",
  "revokeRoleAfterSignal",
  "cancelGrantRole",
];

async function getTimelock(): Promise<TimelockConfig> {
  const network = hre.network.name;

  if (network === "arbitrum") {
    throw new Error("Contract not deployed yet");
    // return await ethers.getContractAt("TimelockConfig", "0x...");
  }

  if (network === "avalanche") {
    throw new Error("Contract not deployed yet");
    // return await ethers.getContractAt("TimelockConfig", "0x...");
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
        member: "0x5ac4e27341e4cccb3e5fd62f9e62db2adf43dd57",
      },
      {
        role: "CONTROLLER",
        member: "0x994c598e3b0661bb805d53c6fa6b4504b23b68dd",
      },
      {
        role: "ROUTER_PLUGIN",
        member: "0x5ac4e27341e4cccb3e5fd62f9e62db2adf43dd57",
      },
      {
        role: "ROUTER_PLUGIN",
        member: "0x994c598e3b0661bb805d53c6fa6b4504b23b68dd",
      },
    ],
    avalanche: [
      {
        role: "CONTROLLER",
        member: "0xe37d052e1deb99901de205e7186e31a36e4ef70c",
      },
      {
        role: "CONTROLLER",
        member: "0x16500c1d8ffe2f695d8dcadf753f664993287ae4",
      },
      {
        role: "ROUTER_PLUGIN",
        member: "0xe37d052e1deb99901de205e7186e31a36e4ef70c",
      },
      {
        role: "ROUTER_PLUGIN",
        member: "0x16500c1d8ffe2f695d8dcadf753f664993287ae4",
      },
    ],
  };

  const rolesToRemove = {
    arbitrum: [
      {
        role: "CONTROLLER",
        member: "0xf32b417A93Acc039B236F1eCC86B56bd3cB8E698",
      },
      {
        role: "ROLE_ADMIN",
        member: "0xf32b417A93Acc039B236F1eCC86B56bd3cB8E698",
      },
    ],
    avalanche: [
      {
        role: "CONTROLLER",
        member: "0x9Dd6EB1069385D85Ae204543BabB7333181ec8A5",
      },
      {
        role: "ROLE_ADMIN",
        member: "0x9Dd6EB1069385D85Ae204543BabB7333181ec8A5",
      },
    ],
  };

  const multicallWriteParams = [];

  const timelockMethod = process.env.TIMELOCK_METHOD;
  if (!expectedTimelockMethods.includes(timelockMethod)) {
    throw new Error(`Unexpected TIMELOCK_METHOD: ${timelockMethod}`);
  }

  if (timelockMethod === "signalGrantRole") {
    for (const { member, role } of rolesToAdd[hre.network.name]) {
      multicallWriteParams.push(timelock.interface.encodeFunctionData(timelockMethod, [member, hashString(role)]));
    }
  }

  if (timelockMethod === "grantRoleAfterSignal") {
    for (const { member, role } of rolesToAdd[hre.network.name]) {
      const { target, payload } = await getGrantRolePayload(member, hashString(role));
      multicallWriteParams.push(timelock.interface.encodeFunctionData("execute", [target, payload]));
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
      const { target, payload } = await getRevokeRolePayload(member, hashString(role));
      multicallWriteParams.push(timelock.interface.encodeFunctionData("execute", [target, payload]));
    }
  }

  if (timelockMethod === "cancelGrantRole") {
    const actionKeys = await getGrantRoleActionKeysToCancel({ timelock });
    for (const actionKey of actionKeys) {
      multicallWriteParams.push(cancelActionById(timelock, actionKey));
    }
  }

  console.log(`updating ${multicallWriteParams.length} roles`);
  await timelockWriteMulticall({ timelock, multicallWriteParams });
}

main().catch((ex) => {
  console.error(ex);
  process.exit(1);
});
