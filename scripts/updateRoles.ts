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
          member: "0xc2d6cc2b5444b2d3611d812a9ea47648cffc05c1",
          contractName: "Config",
        },
        {
          role: "CONTROLLER",
          member: "0x13c986424ded8d78d9313dd90cd847e4deba5cb3",
          contractName: "Oracle",
        },
        {
          role: "CONTROLLER",
          member: "0xfa843af557824be5127eacb3c4b5d86eadeb73a1",
          contractName: "ExchangeRouter",
        },
        {
          role: "CONTROLLER",
          member: "0x233397357bb4cc6b951aa423d7ceadbc610499e2",
          contractName: "SubaccountRouter",
        },
        {
          role: "CONTROLLER",
          member: "0xb33d87b6be2a6772eebd38c3222f5872a62cca2a",
          contractName: "GelatoRelayRouter",
        },
        {
          role: "CONTROLLER",
          member: "0xe26052e5676e636230a9b05652acd3aca23fc35f",
          contractName: "SubaccountGelatoRelayRouter",
        },
        {
          role: "CONTROLLER",
          member: "0x00db21077c63fff542c017cc4cdcc84229bfb373",
          contractName: "OrderHandler",
        },
        {
          role: "CONTROLLER",
          member: "0xe78c15c818ebaad31bac58167157522b4d01ee2f",
          contractName: "DepositHandler",
        },
        {
          role: "CONTROLLER",
          member: "0x6fa5d5a3377790cf646efdb67fc53d3ce5b345bc",
          contractName: "WithdrawalHandler",
        },
        {
          role: "CONTROLLER",
          member: "0xe270e904b3b52fe952f00e797f5dac4a1e058dda",
          contractName: "ShiftHandler",
        },
        {
          role: "CONTROLLER",
          member: "0x1b31d1774270c46dfc3e1e0d2459a1b94cf9373f",
          contractName: "SwapHandler",
        },
        {
          role: "ROUTER_PLUGIN",
          member: "0xfa843af557824be5127eacb3c4b5d86eadeb73a1",
          contractName: "ExchangeRouter",
        },
        {
          role: "ROUTER_PLUGIN",
          member: "0x233397357bb4cc6b951aa423d7ceadbc610499e2",
          contractName: "SubaccountRouter",
        },
        {
          role: "ROUTER_PLUGIN",
          member: "0xb33d87b6be2a6772eebd38c3222f5872a62cca2a",
          contractName: "GelatoRelayRouter",
        },
        {
          role: "ROUTER_PLUGIN",
          member: "0xe26052e5676e636230a9b05652acd3aca23fc35f",
          contractName: "SubaccountGelatoRelayRouter",
        },
      ],
      rolesToRemove: [
        {
          role: "CONTROLLER",
          member: "0xBD219aADaFe3AD8c8F570b204B99cb4aDbe9983E",
          contractName: "GelatoRelayRouter",
        },
        {
          role: "CONTROLLER",
          member: "0xE971b9D5eA8Ab28bF3639069CF7a91E5dA7b7015",
          contractName: "SubaccountGelatoRelayRouter",
        },
        {
          role: "CONTROLLER",
          member: "0x7D9E403F82b59e7fF5F7A37a9bf4A8df914352A1",
          contractName: "SubaccountRouter",
        },
        {
          role: "ROUTER_PLUGIN",
          member: "0xBD219aADaFe3AD8c8F570b204B99cb4aDbe9983E",
          contractName: "GelatoRelayRouter",
        },
        {
          role: "ROUTER_PLUGIN",
          member: "0xE971b9D5eA8Ab28bF3639069CF7a91E5dA7b7015",
          contractName: "SubaccountGelatoRelayRouter",
        },
        {
          role: "ROUTER_PLUGIN",
          member: "0x7D9E403F82b59e7fF5F7A37a9bf4A8df914352A1",
          contractName: "SubaccountRouter",
        },
      ],
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
