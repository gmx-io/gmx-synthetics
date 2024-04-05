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

// update roles in config/roles.ts
// then run scripts/validateRoles.ts, it should output the role changes
// update rolesToAdd and rolesToRemove here
// then run e.g. TIMELOCK_METHOD=signalGrantRole npx hardhat run --network arbitrum scripts/updateRoles.ts
async function main() {
  // NOTE: the existing Timelock needs to be used to grant roles to new contracts including new Timelocks
  const timelock = await getTimelock();

  const rolesToAdd = {
    arbitrum: [
      {
        role: "ADL_KEEPER",
        member: "0xde10336a5c37ab8fbfd6cd53bdeca5b0974737ba",
      },
      {
        role: "ADL_KEEPER",
        member: "0xeb2a53ff17a747b6000041fb4919b3250f2892e3",
      },
      {
        role: "ADL_KEEPER",
        member: "0x8808c5e5bc9317bf8cb5ee62339594b8d95f77df",
      },
      {
        role: "FROZEN_ORDER_KEEPER",
        member: "0xde10336a5c37ab8fbfd6cd53bdeca5b0974737ba",
      },
      {
        role: "FROZEN_ORDER_KEEPER",
        member: "0xeb2a53ff17a747b6000041fb4919b3250f2892e3",
      },
      {
        role: "FROZEN_ORDER_KEEPER",
        member: "0x8808c5e5bc9317bf8cb5ee62339594b8d95f77df",
      },
      {
        role: "LIMITED_CONFIG_KEEPER",
        member: "0xde10336a5c37ab8fbfd6cd53bdeca5b0974737ba",
      },
      {
        role: "LIMITED_CONFIG_KEEPER",
        member: "0xeb2a53ff17a747b6000041fb4919b3250f2892e3",
      },
      {
        role: "LIMITED_CONFIG_KEEPER",
        member: "0x8808c5e5bc9317bf8cb5ee62339594b8d95f77df",
      },
      {
        role: "LIQUIDATION_KEEPER",
        member: "0xde10336a5c37ab8fbfd6cd53bdeca5b0974737ba",
      },
      {
        role: "LIQUIDATION_KEEPER",
        member: "0xeb2a53ff17a747b6000041fb4919b3250f2892e3",
      },
      {
        role: "LIQUIDATION_KEEPER",
        member: "0x8808c5e5bc9317bf8cb5ee62339594b8d95f77df",
      },
      {
        role: "ORDER_KEEPER",
        member: "0xde10336a5c37ab8fbfd6cd53bdeca5b0974737ba",
      },
      {
        role: "ORDER_KEEPER",
        member: "0xeb2a53ff17a747b6000041fb4919b3250f2892e3",
      },
      {
        role: "ORDER_KEEPER",
        member: "0x8808c5e5bc9317bf8cb5ee62339594b8d95f77df",
      },
    ],
    avalanche: [
      {
        role: "ADL_KEEPER",
        member: "0xde10336a5c37ab8fbfd6cd53bdeca5b0974737ba",
      },
      {
        role: "ADL_KEEPER",
        member: "0xeb2a53ff17a747b6000041fb4919b3250f2892e3",
      },
      {
        role: "ADL_KEEPER",
        member: "0x8808c5e5bc9317bf8cb5ee62339594b8d95f77df",
      },
      {
        role: "FROZEN_ORDER_KEEPER",
        member: "0xde10336a5c37ab8fbfd6cd53bdeca5b0974737ba",
      },
      {
        role: "FROZEN_ORDER_KEEPER",
        member: "0xeb2a53ff17a747b6000041fb4919b3250f2892e3",
      },
      {
        role: "FROZEN_ORDER_KEEPER",
        member: "0x8808c5e5bc9317bf8cb5ee62339594b8d95f77df",
      },
      {
        role: "LIMITED_CONFIG_KEEPER",
        member: "0xde10336a5c37ab8fbfd6cd53bdeca5b0974737ba",
      },
      {
        role: "LIMITED_CONFIG_KEEPER",
        member: "0xeb2a53ff17a747b6000041fb4919b3250f2892e3",
      },
      {
        role: "LIMITED_CONFIG_KEEPER",
        member: "0x8808c5e5bc9317bf8cb5ee62339594b8d95f77df",
      },
      {
        role: "LIQUIDATION_KEEPER",
        member: "0xde10336a5c37ab8fbfd6cd53bdeca5b0974737ba",
      },
      {
        role: "LIQUIDATION_KEEPER",
        member: "0xeb2a53ff17a747b6000041fb4919b3250f2892e3",
      },
      {
        role: "LIQUIDATION_KEEPER",
        member: "0x8808c5e5bc9317bf8cb5ee62339594b8d95f77df",
      },
      {
        role: "ORDER_KEEPER",
        member: "0xde10336a5c37ab8fbfd6cd53bdeca5b0974737ba",
      },
      {
        role: "ORDER_KEEPER",
        member: "0xeb2a53ff17a747b6000041fb4919b3250f2892e3",
      },
      {
        role: "ORDER_KEEPER",
        member: "0x8808c5e5bc9317bf8cb5ee62339594b8d95f77df",
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
