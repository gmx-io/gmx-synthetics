import hre from "hardhat";
import { hashString } from "../utils/hash";
import { cancelActionById, getGrantRolePayload, getRevokeRolePayload, timelockWriteMulticall } from "../utils/timelock";
import { writeSafeBatchJson } from "../utils/safeTx";
import { TimelockConfig } from "../typechain-types";
import { ContractInfo, validateSourceCode } from "./validateDeploymentUtils";

import * as _rolesToAdd from "./roles/rolesToAdd";
import * as _rolesToRemove from "./roles/rolesToRemove";

// GMX protocol multisig, same address on every network; holds TIMELOCK_ADMIN and executes the batch.
// Only stamped into the Safe batch meta (provenance), does not affect the transactions.
const PROTOCOL_MULTISIG = "0x58F582455b54d7c83d03BCeed95FAf72B37fdDD7";

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
    return await ethers.getContractAt("TimelockConfig", "0x4A1D9e342E2dB5f4a02c9eF5cB29CaF289f31599");
  }

  if (network === "avalanche") {
    return await ethers.getContractAt("TimelockConfig", "0x37e1AeB6118B0106810D2eF7662875C414e39Ca4");
  }

  if (network === "botanix") {
    return await ethers.getContractAt("TimelockConfig", "0x72a30e76827Ce83cEf0b1BEd7e9aAF9F4a576990");
  }

  if (network === "megaEth") {
    return await ethers.getContractAt("TimelockConfig", "0x9d5f3fac443748c28FB5dc964D74F8419F686F6D");
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
// 1. update roles in config/roles.ts or config/roleConfigs/<network>.ts
// 2. then run scripts/validateRoles.ts, it should output the role changes
// 3. update rolesToAdd and rolesToRemove from scripts/roles/rolesToAdd/<network>.ts and scripts/roles/rolesToRemove/<network>.ts
// 4. then run e.g. WRITE=true TIMELOCK_METHOD=signalGrantRole npx hardhat run --network arbitrum scripts/updateRoles.ts
// 5. after the timelock delay, run WRITE=true TIMELOCK_METHOD=grantRoleAfterSignal npx hardhat run --network arbitrum scripts/updateRoles.ts
// see utils/signer.ts for steps on how to sign the transactions
//
// each run also writes Safe Transaction Builder batch(es) to out/safe-batch-updateRoles-<method>-<network>-<stamp>.json
// (load in Safe --> Transaction Builder to execute from the protocol multisig instead of signing from an EOA).
// large batches are split into files of up to SAFE_TX_BATCH_SIZE txs (default 50) so air-gapped signers don't freeze.
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
  const salt = process.env.SALT || ethers.constants.HashZero;
  console.log("salt", salt);

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
  // skip validation for megaEth as megaEtherscan is contract verifier is broken atm
  if (hre.network.name !== "megaEth") {
    for (const contractInfo of Object.values(contractInfos)) {
      await validateSourceCode(provider, contractInfo);
      if (!contractInfo.isCodeValidated) {
        console.log(`❌${contractInfo.name} is not valid. Sources do not match. See diff in validation folder`);
      } else {
        console.log(`✅${contractInfo.name}, ${contractInfo.address} is valid`);
      }
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

  // Write a Safe Transaction Builder batch so the change can be reviewed per-row and executed
  // from the protocol multisig instead of an EOA. Every multicall payload is a single timelock
  // call (signalGrantRole / signalRevokeRole / execute) with primitive + bytes params, so decode
  // each one back into a Safe tx row. The timelockWriteMulticall path below is unchanged and still
  // sends timelock.multicall(bytes[]); the batch here mirrors it exactly.
  const safeBatchTransactions: any[] = [];
  for (const data of multicallWriteParams) {
    if (typeof data !== "string") {
      console.warn("skipping non-encoded multicall entry for the Safe batch");
      continue;
    }
    const parsed = timelock.interface.parseTransaction({ data });
    safeBatchTransactions.push({
      to: timelock.address,
      value: "0",
      data: null,
      contractMethod: {
        name: parsed.name,
        payable: false,
        inputs: parsed.functionFragment.inputs.map((p) => ({ name: p.name, type: p.type, internalType: p.type })),
      },
      contractInputsValues: Object.fromEntries(
        parsed.functionFragment.inputs.map((p) => {
          const v = parsed.args[p.name];
          return [p.name, ethers.BigNumber.isBigNumber(v) ? v.toString() : typeof v === "boolean" ? String(v) : v];
        })
      ),
    });
  }

  // Air-gapped Safe signers can freeze on very large batches, so split into files of at most
  // SAFE_TX_BATCH_SIZE txs (default 50). Each timelock call here is independent (predecessor = HashZero),
  // so executing the parts as separate Safe txs is equivalent to one combined batch.
  const batchSize = Number(process.env.SAFE_TX_BATCH_SIZE) || 50;
  const chunks: any[][] = [];
  for (let i = 0; i < safeBatchTransactions.length; i += batchSize) {
    chunks.push(safeBatchTransactions.slice(i, i + batchSize));
  }
  if (chunks.length > 1) {
    console.log(
      `splitting ${safeBatchTransactions.length} txs into ${chunks.length} Safe batches of up to ${batchSize}`
    );
  }
  chunks.forEach((chunk, i) => {
    writeSafeBatchJson({
      scriptName: "updateRoles",
      label: chunks.length > 1 ? `${timelockMethod}-${i + 1}of${chunks.length}` : timelockMethod,
      transactions: chunk,
      createdFromSafeAddress: PROTOCOL_MULTISIG,
    });
  });

  await timelockWriteMulticall({ timelock, multicallWriteParams });
}

main().catch((ex) => {
  console.error(ex);
  process.exit(1);
});
