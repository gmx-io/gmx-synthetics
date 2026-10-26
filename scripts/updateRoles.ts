import hre from "hardhat";
import { providers } from "ethers";
import { hashString } from "../utils/hash";
import { getGrantRolePayload, getRevokeRolePayload, timelockWriteMulticall } from "../utils/timelock";
import { createSafeBatchOutputDir, getSafeTxBatchSize, writeSafeBatchJson } from "../utils/safeTx";
import { PROTOCOL_MULTISIG } from "../utils/constants";
import { getTimelockConfig } from "../utils/timelockConfig";
import { ContractInfo, validateSourceCode } from "./validateDeploymentUtils";
import { runRoleGrantCleanup } from "./cancelRoleGrantsUtils";

import * as _rolesToAdd from "./roles/rolesToAdd";
import * as _rolesToRemove from "./roles/rolesToRemove";

const expectedTimelockMethods = [
  "signalGrantRole",
  "grantRoleAfterSignal",
  "signalRevokeRole",
  "revokeRoleAfterSignal",
  "cancelGrantRole",
];
// Role changes: both signal modes schedule a grant/revoke pair for each account and role.
// 1. Update config/roles.ts or config/roleConfigs/<network>.ts, then run scripts/validateRoles.ts.
// 2. Update scripts/roles/rolesToAdd/<network>.ts and rolesToRemove/<network>.ts from its output.
// 3. Run TIMELOCK_METHOD=signalGrantRole (rolesToAdd) or signalRevokeRole (rolesToRemove).
// 4. After the timelock delay, run grantRoleAfterSignal or revokeRoleAfterSignal with the same SALT.
//    Commands use: TIMELOCK_METHOD=<method> npx hardhat run scripts/updateRoles.ts --network <network>
//    Normal modes retain simulation and signing; WRITE=true skips their signing prompt.
//    Review the Safe batches before executing them. See utils/signer.ts for the signing flow.
// 5. After revokes execute, run TIMELOCK_METHOD=cancelGrantRole with the command above.
//    This reads executed-revoke history and generates cancellation batches for leftover paired grants;
//    it does not sign or submit transactions, even with WRITE=true.
// 6. Execute the reviewed cancellation batches through Safe, then rerun cancelGrantRole.
//    Completion means report.complete=true and no new cancellation batches, not merely exit code zero.
//
// Safe batches share a timestamped run folder: out/updateRoles-<method>-<network>-<timestamp>/.
// Cleanup also writes report.json, including role names and informational pending revoke counterparts.
// SAFE_TX_BATCH_SIZE defaults to 50: positive integers for all modes, even sizes for paired signalling.
// Keep each signal pair in one Safe transaction. See docs/role-grant-cleanup.md for the full workflow.
export async function main(cleanupProvider?: providers.Provider) {
  const timelockMethod = process.env.TIMELOCK_METHOD;
  if (!expectedTimelockMethods.includes(timelockMethod)) {
    throw new Error(`Unexpected TIMELOCK_METHOD: ${timelockMethod}`);
  }
  // Cleanup uses the original signal receipts, without current role lists, source validation, or WRITE.
  if (timelockMethod === "cancelGrantRole") {
    return runRoleGrantCleanup(cleanupProvider);
  }
  const batchSize = getSafeTxBatchSize();
  if ((timelockMethod === "signalGrantRole" || timelockMethod === "signalRevokeRole") && batchSize % 2 !== 0) {
    throw new Error("SAFE_TX_BATCH_SIZE must be even for paired role signals");
  }

  // the existing Timelock needs to be used to grant roles to new contracts including new Timelocks;
  // pass it as TIMELOCK_CONFIG when the deployment already points at a new one
  const timelock = await getTimelockConfig();

  const multicallWriteParams = [];

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
  // SAFE_TX_BATCH_SIZE txs (default 50). Even signal batches keep adjacent grant/revoke pairs
  // in the same transaction, which is required for later cleanup to identify each original pair.
  const chunks: any[][] = [];
  for (let i = 0; i < safeBatchTransactions.length; i += batchSize) {
    chunks.push(safeBatchTransactions.slice(i, i + batchSize));
  }
  if (chunks.length > 1) {
    console.log(
      `splitting ${safeBatchTransactions.length} txs into ${chunks.length} Safe batches of up to ${batchSize}`
    );
  }
  const outputDir = chunks.length
    ? createSafeBatchOutputDir({ scriptName: "updateRoles", label: timelockMethod })
    : undefined;
  chunks.forEach((chunk, i) => {
    writeSafeBatchJson({
      scriptName: "updateRoles",
      label: chunks.length > 1 ? `${timelockMethod}-${i + 1}of${chunks.length}` : timelockMethod,
      transactions: chunk,
      createdFromSafeAddress: PROTOCOL_MULTISIG,
      outputDir,
    });
  });

  await timelockWriteMulticall({ timelock, multicallWriteParams });
}

if (require.main === module) {
  main().catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
}
