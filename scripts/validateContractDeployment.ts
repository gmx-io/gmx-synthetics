import hre, { ethers } from "hardhat";
import { execSync } from "child_process";
import dotenv from "dotenv";
import { Result } from "@ethersproject/abi";
import { TransactionReceipt } from "@ethersproject/providers";
import { ContractInfo, SignalRoleInfo, validateSourceCode } from "./validateDeploymentUtils";

dotenv.config();

const COMMIT_HASH = process.env.COMMIT_HASH as string;
const TRANSACTION_HASH = process.env.TRANSACTION_HASH as string;

const roleLabels = {
  [encodeRole("ROLE_ADMIN")]: "ROLE_ADMIN",
  [encodeRole("TIMELOCK_ADMIN")]: "TIMELOCK_ADMIN",
  [encodeRole("TIMELOCK_MULTISIG")]: "TIMELOCK_MULTISIG",
  [encodeRole("CONFIG_KEEPER")]: "CONFIG_KEEPER",
  [encodeRole("LIMITED_CONFIG_KEEPER")]: "LIMITED_CONFIG_KEEPER",
  [encodeRole("CONTROLLER")]: "CONTROLLER",
  [encodeRole("GOV_TOKEN_CONTROLLER")]: "GOV_TOKEN_CONTROLLER",
  [encodeRole("ROUTER_PLUGIN")]: "ROUTER_PLUGIN",
  [encodeRole("MARKET_KEEPER")]: "MARKET_KEEPER",
  [encodeRole("FEE_KEEPER")]: "FEE_KEEPER",
  [encodeRole("FEE_DISTRIBUTION_KEEPER")]: "FEE_DISTRIBUTION_KEEPER",
  [encodeRole("ORDER_KEEPER")]: "ORDER_KEEPER",
  [encodeRole("FROZEN_ORDER_KEEPER")]: "FROZEN_ORDER_KEEPER",
  [encodeRole("PRICING_KEEPER")]: "PRICING_KEEPER",
  [encodeRole("LIQUIDATION_KEEPER")]: "LIQUIDATION_KEEPER",
  [encodeRole("ADL_KEEPER")]: "ADL_KEEPER",
  [encodeRole("CONTRIBUTOR_KEEPER")]: "CONTRIBUTOR_KEEPER",
};

async function main() {
  if (!COMMIT_HASH || !TRANSACTION_HASH) {
    console.error("Error: Missing COMMIT_HASH or TRANSACTION_HASH in environment variables.");
    process.exit(1);
  }

  const provider = hre.ethers.provider;
  const tx = await provider.getTransactionReceipt(TRANSACTION_HASH);
  if (!tx) {
    console.error("Transaction not found.");
    process.exit(1);
  }

  console.log(`Checking deployment against commit: ${COMMIT_HASH}`);
  execSync(`git checkout ${COMMIT_HASH}`, { stdio: "inherit" });

  const contractInfos = await extractRolesFromTx(tx);
  console.log("Contracts: ", contractInfos);
  for (const contractInfo of contractInfos) {
    try {
      await validateSourceCode(provider, contractInfo);
    } catch (error) {
      console.error(error);
      process.exit(1);
    }

    await validateRoles(contractInfo);
  }

  printResults(contractInfos);

  // Restore git to previous state
  execSync(`git checkout -`, { stdio: "inherit" });
  console.log("Verification completed.");
}

function printResults(contractInfos: ContractInfo[]) {
  for (const contractInfo of contractInfos) {
    if (contractInfo.isCodeValidated) {
      console.log(`✅${contractInfo.name} is valid`);
    } else {
      console.log(`❌${contractInfo.name} is not valid. Sources do not match. See diff in validation folder`);
    }
    console.log(`Following roles signalled:`);
    for (const signalledRole of contractInfo.signalledRoles) {
      `- ${roleLabels[signalledRole]}`;
    }
    for (const unapprovedRole of contractInfo.unapprovedRoles) {
      `❌ ${unapprovedRole} ${roleLabels[unapprovedRole]} is not approved for ${contractInfo.name} ${contractInfo.address}!`;
    }
  }
}

// Roles

async function extractRolesFromTx(txReceipt: TransactionReceipt): Promise<ContractInfo[]> {
  const contractInfos = new Map<string, ContractInfo>();
  const EventEmitter = await ethers.getContractFactory("EventEmitter");
  const eventEmitterInterface = EventEmitter.interface;

  for (const log of txReceipt.logs) {
    const parsedLog = eventEmitterInterface.parseLog(log);

    if (parsedLog.name == "EventLog1" && parsedLog.args[1] === "SignalGrantRole") {
      const signal = parseSignalGrantRoleEvent(parsedLog.args);
      if (contractInfos.has(signal.account)) {
        contractInfos.get(signal.account).signalledRoles.push(signal.roleKey);
      } else {
        contractInfos.set(signal.account, {
          address: signal.account.toLowerCase(),
          name: null,
          isCodeValidated: false,
          signalledRoles: [signal.roleKey],
          unapprovedRoles: [],
        });
      }
    }
  }
  return [...contractInfos].map(([, value]) => value);
}

async function validateRoles(contractInfo: ContractInfo) {
  const { requiredRolesForContracts } = await hre.gmx.getRoles();
  for (const signalledRole of contractInfo.signalledRoles) {
    if (!(await checkRole(contractInfo.name, contractInfo.address, signalledRole, requiredRolesForContracts))) {
      contractInfo.unapprovedRoles.push(signalledRole);
    }
  }
  console.log(`✅ Roles for ${contractInfo.name} validated`);
}

function parseSignalGrantRoleEvent(eventArg: Result): SignalRoleInfo {
  const account = eventArg[4][0][0][0].value;
  const roleKey = eventArg[4][4][0][0].value;
  return {
    account: account,
    roleKey: roleKey,
  };
}

function encodeRole(roleKey: string): string {
  const encoded = ethers.utils.defaultAbiCoder.encode(["string"], [roleKey]);
  return ethers.utils.keccak256(encoded);
}

async function checkRole(
  contractName: string,
  contractAddress: string,
  signalledRole: string,
  requiredRolesForContracts: Record<string, string[]>
): Promise<boolean> {
  const rolesConfig = await hre.gmx.getRoles();
  for (const [role, addresses] of Object.entries(rolesConfig.roles)) {
    if (addresses[contractAddress]) {
      if (encodeRole(role) === signalledRole && requiredRolesForContracts[role].includes(contractName)) {
        return true;
      }
    }
  }
  return false;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
