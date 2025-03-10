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
          member: "0x17de9ad7c5eca85e50381f9c51e32e859d5f2086",
        },
        {
          role: "CONTROLLER",
          member: "0x6dbe12529a9d039a6af20be488d5e46f22901eec",
        },
        {
          role: "CONTROLLER",
          member: "0x1037c3b54b3109a495b8d0cce6c32f819284f0cf",
        },
        {
          role: "CONTROLLER",
          member: "0x331da018c1ddf565ae081f267174689940a8490e",
        },
        {
          role: "CONTROLLER",
          member: "0x03a6e8af1685099470019de39b1573d415856879",
        },
        {
          role: "CONTROLLER",
          member: "0x470d512de68665a33416d30f0d7580781aaa2748",
        },
        {
          role: "CONTROLLER",
          member: "0x8d5ba31b20725c10b9fb60b8a3e5c9bc6aa7c74c",
        },
        {
          role: "CONTROLLER",
          member: "0x98723bd186581c461e8f77d8b17e7fac2d141a48",
        },
        {
          role: "CONTROLLER",
          member: "0x2fb22eab0f84557dac6fc9d800cae11602662f78",
        },
        {
          role: "CONTROLLER",
          member: "0xa1e8ee77a44616924cc235d1f8e0175c85e3f37d",
        },
        {
          role: "ROUTER_PLUGIN",
          member: "0x470d512de68665a33416d30f0d7580781aaa2748",
        },
        {
          role: "ROUTER_PLUGIN",
          member: "0x8d5ba31b20725c10b9fb60b8a3e5c9bc6aa7c74c",
        },
        {
          role: "ROUTER_PLUGIN",
          member: "0x98723bd186581c461e8f77d8b17e7fac2d141a48",
        },
        {
          role: "ROUTER_PLUGIN",
          member: "0x2fb22eab0f84557dac6fc9d800cae11602662f78",
        },
      ],
      rolesToRemove: [
        {
          role: "CONTROLLER",
          member: "0xf64c8469e5B566251301904f4F77A911438C775F",
        },
        {
          role: "CONTROLLER",
          member: "0x871a0CAa75dea231FA290ee26F1955B29a7F8a86",
        },
        {
          role: "CONTROLLER",
          member: "0x26410a3121BCAB865b9ceae50dFfA04DF9E783B1",
        },
        {
          role: "ROUTER_PLUGIN",
          member: "0xf64c8469e5B566251301904f4F77A911438C775F",
        },
        {
          role: "ROUTER_PLUGIN",
          member: "0x871a0CAa75dea231FA290ee26F1955B29a7F8a86",
        },
        {
          role: "ROUTER_PLUGIN",
          member: "0x26410a3121BCAB865b9ceae50dFfA04DF9E783B1",
        },
      ],
    },
    avalanche: {
      rolesToAdd: [],
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
    for (const { member, role } of networkConfig.rolesToAdd) {
      multicallWriteParams.push(timelock.interface.encodeFunctionData(timelockMethod, [member, hashString(role)]));
    }
  }

  if (timelockMethod === "signalRevokeRole") {
    for (const { member, role } of networkConfig.rolesToRemove) {
      multicallWriteParams.push(timelock.interface.encodeFunctionData(timelockMethod, [member, hashString(role)]));
      // signalGrantRole in case the revocation of the role needs to be reverted
      multicallWriteParams.push(timelock.interface.encodeFunctionData("signalGrantRole", [member, hashString(role)]));
    }
  }

  if (timelockMethod === "revokeRoleAfterSignal") {
    for (const { member, role } of networkConfig.rolesToRemove) {
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
