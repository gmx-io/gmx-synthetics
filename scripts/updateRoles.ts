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

  const rolesToAdd = {
    arbitrum: [
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
    avalanche: [
      {
        role: "CONTROLLER",
        member: "0x2921bad580cef4b03b5461d184a4c7ab637028d6",
      },
      {
        role: "CONTROLLER",
        member: "0x45277bad220bb6b350973b61c9cc9f7ec536b5a1",
      },
      {
        role: "CONTROLLER",
        member: "0xf1998f8202f9707ffb6953826d4db97fbc6acc08",
      },
      {
        role: "CONTROLLER",
        member: "0x29fa2de428b251d7d7c5b0b0fac7b970e113650e",
      },
      {
        role: "CONTROLLER",
        member: "0x900173a66dbd345006c51fa35fa3ab760fcd843b",
      },
      {
        role: "CONTROLLER",
        member: "0xcc090e92824d0f75faeb2287eeca8d91aa6f06bb",
      },
      {
        role: "CONTROLLER",
        member: "0xa9c8bc4f151da37753576114fcedfb3572333c6b",
      },
      {
        role: "CONTROLLER",
        member: "0x82a792457f9af42d10fcde829708bd80b156c6f9",
      },
      {
        role: "CONTROLLER",
        member: "0x0c4d69369982f7e8002089387a95ff059deff6b3",
      },
      {
        role: "ROUTER_PLUGIN",
        member: "0xcc090e92824d0f75faeb2287eeca8d91aa6f06bb",
      },
      {
        role: "ROUTER_PLUGIN",
        member: "0xa9c8bc4f151da37753576114fcedfb3572333c6b",
      },
      {
        role: "ROUTER_PLUGIN",
        member: "0x82a792457f9af42d10fcde829708bd80b156c6f9",
      },
      {
        role: "ROUTER_PLUGIN",
        member: "0x0c4d69369982f7e8002089387a95ff059deff6b3",
      },
    ],
  };

  const rolesToRemove = {
    arbitrum: [
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
    avalanche: [
      {
        role: "CONTROLLER",
        member: "0xBD219aADaFe3AD8c8F570b204B99cb4aDbe9983E",
      },
      {
        role: "CONTROLLER",
        member: "0xE971b9D5eA8Ab28bF3639069CF7a91E5dA7b7015",
      },
      {
        role: "CONTROLLER",
        member: "0x7D9E403F82b59e7fF5F7A37a9bf4A8df914352A1",
      },
      {
        role: "ROUTER_PLUGIN",
        member: "0xBD219aADaFe3AD8c8F570b204B99cb4aDbe9983E",
      },
      {
        role: "ROUTER_PLUGIN",
        member: "0xE971b9D5eA8Ab28bF3639069CF7a91E5dA7b7015",
      },
      {
        role: "ROUTER_PLUGIN",
        member: "0x7D9E403F82b59e7fF5F7A37a9bf4A8df914352A1",
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
