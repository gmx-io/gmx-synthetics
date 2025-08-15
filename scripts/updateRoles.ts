import hre from "hardhat";
import { hashString } from "../utils/hash";
import { cancelActionById, getGrantRolePayload, getRevokeRolePayload, timelockWriteMulticall } from "../utils/timelock";
import { TimelockConfig } from "../typechain-types";
import { ContractInfo, validateSourceCode } from "./validateDeploymentUtils";

import * as _rolesToAdd from "./roles/rolesToAdd";
import * as _rolesToRemove from "./roles/rolesToRemove";

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
    return await ethers.getContractAt("TimelockConfig", "0x625D4b5456f065756De8d618dE094bE7618e8A0d");
  }

  if (network === "avalanche") {
    return await ethers.getContractAt("TimelockConfig", "0x40794bcBCFb347689fa8c4da69f6405Cf0ECf2C5");
  }

  if (network === "botanix") {
    return await ethers.getContractAt("TimelockConfig", "0x8fB97fEfF5f7CfbE9c63D51F6CbBC914E425d965");
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

  const multicallWriteParams = [];

  const timelockMethod = process.env.TIMELOCK_METHOD;
  if (!expectedTimelockMethods.includes(timelockMethod)) {
    throw new Error(`Unexpected TIMELOCK_METHOD: ${timelockMethod}`);
  }

  const rolesToAdd = _rolesToAdd[hre.network.name];
  const rolesToRemove = _rolesToRemove[hre.network.name];

  if (!rolesToAdd || !rolesToRemove) {
    throw new Error(`rolesToAdd || rolesToRemove not configured for network ${hre.network.name}`);
  }

  const provider = hre.ethers.provider;

  const predecessor = ethers.constants.HashZero;
  const salt = ethers.constants.HashZero;

  // Check that deployed contracts are matching with local sources
  const contractInfos: Map<string, ContractInfo> = new Map();
  for (const { member, role, contractName } of rolesToAdd) {
    if (contractInfos.has(contractName)) {
      contractInfos[contractName].signalledRoles.push(hashString(role));
    } else {
      contractInfos[contractName] = {
        address: member,
        name: contractName,
        isCodeValidated: false,
        signalledRoles: [hashString(role)],
        unapprovedRoles: [],
        approvedRoles: [],
      };
    }
  }

  // Check that deployed contracts are matching with local sources
  for (const contractInfo of Object.values(contractInfos)) {
    await validateSourceCode(provider, contractInfo);
    if (!contractInfo.isCodeValidated) {
      console.log(`❌${contractInfo.name} is not valid. Sources do not match. See diff in validation folder`);
    } else {
      console.log(`✅${contractInfo.name} is valid`);
    }
  }

  // signalGrantRole and signalRevokeRole in case the granting / revocation of roles needs to be reverted
  if (timelockMethod === "signalGrantRole" || timelockMethod === "signalRevokeRole") {
    const roles = timelockMethod === "signalGrantRole" ? rolesToAdd : rolesToRemove;
    for (const { member, role, contractName } of roles) {
      console.log("%s %s %s %s", timelockMethod, member, role, contractName);
      multicallWriteParams.push(
        timelock.interface.encodeFunctionData("signalRevokeRole", [member, hashString(role), predecessor, salt])
      );
      multicallWriteParams.push(
        timelock.interface.encodeFunctionData("signalGrantRole", [member, hashString(role), predecessor, salt])
      );
    }
  }

  if (timelockMethod === "grantRoleAfterSignal") {
    for (const { member, role } of rolesToAdd) {
      const { target, payload } = await getGrantRolePayload(member, hashString(role));
      multicallWriteParams.push(timelock.interface.encodeFunctionData("execute", [target, payload, predecessor, salt]));
    }
  }

  if (timelockMethod === "revokeRoleAfterSignal") {
    for (const { member, role, contractName } of rolesToRemove) {
      console.log("%s %s %s %s", timelockMethod, member, role, contractName);
      const { target, payload } = await getRevokeRolePayload(member, hashString(role));
      multicallWriteParams.push(timelock.interface.encodeFunctionData("execute", [target, payload, predecessor, salt]));
    }
  }

  if (timelockMethod === "cancelGrantRole") {
    const actionKeys = await getGrantRoleActionKeysToCancel({ timelock });
    for (const actionKey of actionKeys) {
      console.log("%s %s", timelockMethod, actionKey);
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
