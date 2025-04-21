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
    return await ethers.getContractAt("Timelock", "0x7A967D114B8676874FA2cFC1C14F3095C88418Eb");
  }

  if (network === "avalanche") {
    return await ethers.getContractAt("Timelock", "0xdF23692341538340db0ff04C65017F51b69a29f6");
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

  const config = {
    arbitrum: {
      rolesToAdd: [
        {
          role: "CONTROLLER",
          member: "0x602b805eedddbbd9ddff44a7dcbd46cb07849685",
          contractName: "ExchangeRouter",
        },
        {
          role: "CONTROLLER",
          member: "0x089f51aab35e854d2b65c9396622361a1854bc3d",
          contractName: "DepositHandler",
        },
        {
          role: "CONTROLLER",
          member: "0x94889b5d664eaff4c249d43206705a70a22e37b4",
          contractName: "ShiftHandler",
        },
        {
          role: "ROUTER_PLUGIN",
          member: "0x602b805eedddbbd9ddff44a7dcbd46cb07849685",
          contractName: "ExchangeRouter",
        },
      ],
      rolesToRemove: [],
    },
    avalanche: {
      rolesToAdd: [
        {
          role: "CONTROLLER",
          member: "0x9eb239edf4c6f4c4fc9d30ea2017f8716d049c8d",
          contractName: "Config",
        },
        {
          role: "CONTROLLER",
          member: "0x035a9a047d20a486e14a613b04d5a95d7a617c5d",
          contractName: "GelatoRelayRouter",
        },
        {
          role: "CONTROLLER",
          member: "0x3b753c0d0ae55530f24532b8bb9d0bacd5b675c0",
          contractName: "SubaccountGelatoRelayRouter",
        },
        {
          role: "ROUTER_PLUGIN",
          member: "0x035a9a047d20a486e14a613b04d5a95d7a617c5d",
          contractName: "GelatoRelayRouter",
        },
        {
          role: "ROUTER_PLUGIN",
          member: "0x3b753c0d0ae55530f24532b8bb9d0bacd5b675c0",
          contractName: "SubaccountGelatoRelayRouter",
        },
      ],
      rolesToRemove: [],
    },
  };

  const multicallWriteParams = [];

  const timelockMethod = process.env.TIMELOCK_METHOD;
  if (!expectedTimelockMethods.includes(timelockMethod)) {
    throw new Error(`Unexpected TIMELOCK_METHOD: ${timelockMethod}`);
  }

  const networkConfig = config[hre.network.name];

  if (["signalGrantRole", "grantRoleAfterSignal"].includes(timelockMethod)) {
    for (const { member, role, contractName } of networkConfig.rolesToAdd) {
      console.log("%s %s %s %s", timelockMethod, member, role, contractName);
      multicallWriteParams.push(timelock.interface.encodeFunctionData(timelockMethod, [member, hashString(role)]));
    }
  }

  if (timelockMethod === "signalRevokeRole") {
    for (const { member, role, contractName } of networkConfig.rolesToRemove) {
      console.log("%s %s %s %s", timelockMethod, member, role, contractName);
      multicallWriteParams.push(timelock.interface.encodeFunctionData(timelockMethod, [member, hashString(role)]));
      // signalGrantRole in case the revocation of the role needs to be reverted
      multicallWriteParams.push(timelock.interface.encodeFunctionData("signalGrantRole", [member, hashString(role)]));
    }
  }

  if (timelockMethod === "revokeRoleAfterSignal") {
    for (const { member, role, contractName } of networkConfig.rolesToRemove) {
      console.log("%s %s %s %s", timelockMethod, member, role, contractName);
      multicallWriteParams.push(timelock.interface.encodeFunctionData(timelockMethod, [member, hashString(role)]));
    }
  }

  if (timelockMethod === "cancelGrantRole") {
    const actionKeys = await getGrantRoleActionKeysToCancel({ timelock });
    for (const actionKey of actionKeys) {
      console.log("%s %s", timelockMethod, actionKey);
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
