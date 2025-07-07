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
          role: "ADL_KEEPER",
          member: "0xa17a86388bbce9fd73a67f66d87fb0222a824c3f",
        },
        {
          role: "ADL_KEEPER",
          member: "0x86fe53a6d47d9a0fdea4c5ac3d80e0e6cc3354cc",
        },
        {
          role: "ADL_KEEPER",
          member: "0x8e2e2dd583e7db8437164a7f89a7288b999253cb",
        },
        {
          role: "ADL_KEEPER",
          member: "0xc0a53a9ee8e8ea0f585d8dcf26800ef2841f97fd",
        },
        {
          role: "ADL_KEEPER",
          member: "0xd316a0043056fb787de34aba8cd5323f5c6f8c47",
        },
        {
          role: "ADL_KEEPER",
          member: "0xb874e07336edc0c278c276ffeb08818976099256",
        },
        {
          role: "ADL_KEEPER",
          member: "0xa5e4a14cab506ba102977648317e0622ca60bb64",
        },
        {
          role: "ADL_KEEPER",
          member: "0xdad787d5a86f37a5e480e35b3ca615d46242ce9b",
        },
        {
          role: "ADL_KEEPER",
          member: "0x56a7ce61d8ab46a27de1837ceddd8522d52d2736",
        },
        {
          role: "ADL_KEEPER",
          member: "0xc9a5775951f0ea25053fee81d935fbbf4f0fb273",
        },
        {
          role: "FROZEN_ORDER_KEEPER",
          member: "0xa17a86388bbce9fd73a67f66d87fb0222a824c3f",
        },
        {
          role: "FROZEN_ORDER_KEEPER",
          member: "0x86fe53a6d47d9a0fdea4c5ac3d80e0e6cc3354cc",
        },
        {
          role: "FROZEN_ORDER_KEEPER",
          member: "0x8e2e2dd583e7db8437164a7f89a7288b999253cb",
        },
        {
          role: "FROZEN_ORDER_KEEPER",
          member: "0xc0a53a9ee8e8ea0f585d8dcf26800ef2841f97fd",
        },
        {
          role: "FROZEN_ORDER_KEEPER",
          member: "0xd316a0043056fb787de34aba8cd5323f5c6f8c47",
        },
        {
          role: "FROZEN_ORDER_KEEPER",
          member: "0xb874e07336edc0c278c276ffeb08818976099256",
        },
        {
          role: "FROZEN_ORDER_KEEPER",
          member: "0xa5e4a14cab506ba102977648317e0622ca60bb64",
        },
        {
          role: "FROZEN_ORDER_KEEPER",
          member: "0xdad787d5a86f37a5e480e35b3ca615d46242ce9b",
        },
        {
          role: "FROZEN_ORDER_KEEPER",
          member: "0x56a7ce61d8ab46a27de1837ceddd8522d52d2736",
        },
        {
          role: "FROZEN_ORDER_KEEPER",
          member: "0xc9a5775951f0ea25053fee81d935fbbf4f0fb273",
        },
        {
          role: "LIMITED_CONFIG_KEEPER",
          member: "0xa17a86388bbce9fd73a67f66d87fb0222a824c3f",
        },
        {
          role: "LIMITED_CONFIG_KEEPER",
          member: "0x86fe53a6d47d9a0fdea4c5ac3d80e0e6cc3354cc",
        },
        {
          role: "LIMITED_CONFIG_KEEPER",
          member: "0x8e2e2dd583e7db8437164a7f89a7288b999253cb",
        },
        {
          role: "LIMITED_CONFIG_KEEPER",
          member: "0xc0a53a9ee8e8ea0f585d8dcf26800ef2841f97fd",
        },
        {
          role: "LIMITED_CONFIG_KEEPER",
          member: "0xd316a0043056fb787de34aba8cd5323f5c6f8c47",
        },
        {
          role: "LIMITED_CONFIG_KEEPER",
          member: "0xb874e07336edc0c278c276ffeb08818976099256",
        },
        {
          role: "LIMITED_CONFIG_KEEPER",
          member: "0xa5e4a14cab506ba102977648317e0622ca60bb64",
        },
        {
          role: "LIMITED_CONFIG_KEEPER",
          member: "0xdad787d5a86f37a5e480e35b3ca615d46242ce9b",
        },
        {
          role: "LIMITED_CONFIG_KEEPER",
          member: "0x56a7ce61d8ab46a27de1837ceddd8522d52d2736",
        },
        {
          role: "LIMITED_CONFIG_KEEPER",
          member: "0xc9a5775951f0ea25053fee81d935fbbf4f0fb273",
        },
        {
          role: "LIQUIDATION_KEEPER",
          member: "0xa17a86388bbce9fd73a67f66d87fb0222a824c3f",
        },
        {
          role: "LIQUIDATION_KEEPER",
          member: "0x86fe53a6d47d9a0fdea4c5ac3d80e0e6cc3354cc",
        },
        {
          role: "LIQUIDATION_KEEPER",
          member: "0x8e2e2dd583e7db8437164a7f89a7288b999253cb",
        },
        {
          role: "LIQUIDATION_KEEPER",
          member: "0xc0a53a9ee8e8ea0f585d8dcf26800ef2841f97fd",
        },
        {
          role: "LIQUIDATION_KEEPER",
          member: "0xd316a0043056fb787de34aba8cd5323f5c6f8c47",
        },
        {
          role: "LIQUIDATION_KEEPER",
          member: "0xb874e07336edc0c278c276ffeb08818976099256",
        },
        {
          role: "LIQUIDATION_KEEPER",
          member: "0xa5e4a14cab506ba102977648317e0622ca60bb64",
        },
        {
          role: "LIQUIDATION_KEEPER",
          member: "0xdad787d5a86f37a5e480e35b3ca615d46242ce9b",
        },
        {
          role: "LIQUIDATION_KEEPER",
          member: "0x56a7ce61d8ab46a27de1837ceddd8522d52d2736",
        },
        {
          role: "LIQUIDATION_KEEPER",
          member: "0xc9a5775951f0ea25053fee81d935fbbf4f0fb273",
        },
        {
          role: "ORDER_KEEPER",
          member: "0xa17a86388bbce9fd73a67f66d87fb0222a824c3f",
        },
        {
          role: "ORDER_KEEPER",
          member: "0x86fe53a6d47d9a0fdea4c5ac3d80e0e6cc3354cc",
        },
        {
          role: "ORDER_KEEPER",
          member: "0x8e2e2dd583e7db8437164a7f89a7288b999253cb",
        },
        {
          role: "ORDER_KEEPER",
          member: "0xc0a53a9ee8e8ea0f585d8dcf26800ef2841f97fd",
        },
        {
          role: "ORDER_KEEPER",
          member: "0xd316a0043056fb787de34aba8cd5323f5c6f8c47",
        },
        {
          role: "ORDER_KEEPER",
          member: "0xb874e07336edc0c278c276ffeb08818976099256",
        },
        {
          role: "ORDER_KEEPER",
          member: "0xa5e4a14cab506ba102977648317e0622ca60bb64",
        },
        {
          role: "ORDER_KEEPER",
          member: "0xdad787d5a86f37a5e480e35b3ca615d46242ce9b",
        },
        {
          role: "ORDER_KEEPER",
          member: "0x56a7ce61d8ab46a27de1837ceddd8522d52d2736",
        },
        {
          role: "ORDER_KEEPER",
          member: "0xc9a5775951f0ea25053fee81d935fbbf4f0fb273",
        },
      ],
      rolesToRemove: [],
    },
    avalanche: {
      rolesToAdd: [
        {
          role: "ADL_KEEPER",
          member: "0xa17a86388bbce9fd73a67f66d87fb0222a824c3f",
        },
        {
          role: "ADL_KEEPER",
          member: "0x86fe53a6d47d9a0fdea4c5ac3d80e0e6cc3354cc",
        },
        {
          role: "ADL_KEEPER",
          member: "0x8e2e2dd583e7db8437164a7f89a7288b999253cb",
        },
        {
          role: "ADL_KEEPER",
          member: "0xc0a53a9ee8e8ea0f585d8dcf26800ef2841f97fd",
        },
        {
          role: "ADL_KEEPER",
          member: "0xd316a0043056fb787de34aba8cd5323f5c6f8c47",
        },
        {
          role: "ADL_KEEPER",
          member: "0xb874e07336edc0c278c276ffeb08818976099256",
        },
        {
          role: "ADL_KEEPER",
          member: "0xa5e4a14cab506ba102977648317e0622ca60bb64",
        },
        {
          role: "ADL_KEEPER",
          member: "0xdad787d5a86f37a5e480e35b3ca615d46242ce9b",
        },
        {
          role: "ADL_KEEPER",
          member: "0x56a7ce61d8ab46a27de1837ceddd8522d52d2736",
        },
        {
          role: "ADL_KEEPER",
          member: "0xc9a5775951f0ea25053fee81d935fbbf4f0fb273",
        },
        {
          role: "FROZEN_ORDER_KEEPER",
          member: "0xa17a86388bbce9fd73a67f66d87fb0222a824c3f",
        },
        {
          role: "FROZEN_ORDER_KEEPER",
          member: "0x86fe53a6d47d9a0fdea4c5ac3d80e0e6cc3354cc",
        },
        {
          role: "FROZEN_ORDER_KEEPER",
          member: "0x8e2e2dd583e7db8437164a7f89a7288b999253cb",
        },
        {
          role: "FROZEN_ORDER_KEEPER",
          member: "0xc0a53a9ee8e8ea0f585d8dcf26800ef2841f97fd",
        },
        {
          role: "FROZEN_ORDER_KEEPER",
          member: "0xd316a0043056fb787de34aba8cd5323f5c6f8c47",
        },
        {
          role: "FROZEN_ORDER_KEEPER",
          member: "0xb874e07336edc0c278c276ffeb08818976099256",
        },
        {
          role: "FROZEN_ORDER_KEEPER",
          member: "0xa5e4a14cab506ba102977648317e0622ca60bb64",
        },
        {
          role: "FROZEN_ORDER_KEEPER",
          member: "0xdad787d5a86f37a5e480e35b3ca615d46242ce9b",
        },
        {
          role: "FROZEN_ORDER_KEEPER",
          member: "0x56a7ce61d8ab46a27de1837ceddd8522d52d2736",
        },
        {
          role: "FROZEN_ORDER_KEEPER",
          member: "0xc9a5775951f0ea25053fee81d935fbbf4f0fb273",
        },
        {
          role: "LIMITED_CONFIG_KEEPER",
          member: "0xa17a86388bbce9fd73a67f66d87fb0222a824c3f",
        },
        {
          role: "LIMITED_CONFIG_KEEPER",
          member: "0x86fe53a6d47d9a0fdea4c5ac3d80e0e6cc3354cc",
        },
        {
          role: "LIMITED_CONFIG_KEEPER",
          member: "0x8e2e2dd583e7db8437164a7f89a7288b999253cb",
        },
        {
          role: "LIMITED_CONFIG_KEEPER",
          member: "0xc0a53a9ee8e8ea0f585d8dcf26800ef2841f97fd",
        },
        {
          role: "LIMITED_CONFIG_KEEPER",
          member: "0xd316a0043056fb787de34aba8cd5323f5c6f8c47",
        },
        {
          role: "LIMITED_CONFIG_KEEPER",
          member: "0xb874e07336edc0c278c276ffeb08818976099256",
        },
        {
          role: "LIMITED_CONFIG_KEEPER",
          member: "0xa5e4a14cab506ba102977648317e0622ca60bb64",
        },
        {
          role: "LIMITED_CONFIG_KEEPER",
          member: "0xdad787d5a86f37a5e480e35b3ca615d46242ce9b",
        },
        {
          role: "LIMITED_CONFIG_KEEPER",
          member: "0x56a7ce61d8ab46a27de1837ceddd8522d52d2736",
        },
        {
          role: "LIMITED_CONFIG_KEEPER",
          member: "0xc9a5775951f0ea25053fee81d935fbbf4f0fb273",
        },
        {
          role: "LIQUIDATION_KEEPER",
          member: "0xa17a86388bbce9fd73a67f66d87fb0222a824c3f",
        },
        {
          role: "LIQUIDATION_KEEPER",
          member: "0x86fe53a6d47d9a0fdea4c5ac3d80e0e6cc3354cc",
        },
        {
          role: "LIQUIDATION_KEEPER",
          member: "0x8e2e2dd583e7db8437164a7f89a7288b999253cb",
        },
        {
          role: "LIQUIDATION_KEEPER",
          member: "0xc0a53a9ee8e8ea0f585d8dcf26800ef2841f97fd",
        },
        {
          role: "LIQUIDATION_KEEPER",
          member: "0xd316a0043056fb787de34aba8cd5323f5c6f8c47",
        },
        {
          role: "LIQUIDATION_KEEPER",
          member: "0xb874e07336edc0c278c276ffeb08818976099256",
        },
        {
          role: "LIQUIDATION_KEEPER",
          member: "0xa5e4a14cab506ba102977648317e0622ca60bb64",
        },
        {
          role: "LIQUIDATION_KEEPER",
          member: "0xdad787d5a86f37a5e480e35b3ca615d46242ce9b",
        },
        {
          role: "LIQUIDATION_KEEPER",
          member: "0x56a7ce61d8ab46a27de1837ceddd8522d52d2736",
        },
        {
          role: "LIQUIDATION_KEEPER",
          member: "0xc9a5775951f0ea25053fee81d935fbbf4f0fb273",
        },
        {
          role: "ORDER_KEEPER",
          member: "0xa17a86388bbce9fd73a67f66d87fb0222a824c3f",
        },
        {
          role: "ORDER_KEEPER",
          member: "0x86fe53a6d47d9a0fdea4c5ac3d80e0e6cc3354cc",
        },
        {
          role: "ORDER_KEEPER",
          member: "0x8e2e2dd583e7db8437164a7f89a7288b999253cb",
        },
        {
          role: "ORDER_KEEPER",
          member: "0xc0a53a9ee8e8ea0f585d8dcf26800ef2841f97fd",
        },
        {
          role: "ORDER_KEEPER",
          member: "0xd316a0043056fb787de34aba8cd5323f5c6f8c47",
        },
        {
          role: "ORDER_KEEPER",
          member: "0xb874e07336edc0c278c276ffeb08818976099256",
        },
        {
          role: "ORDER_KEEPER",
          member: "0xa5e4a14cab506ba102977648317e0622ca60bb64",
        },
        {
          role: "ORDER_KEEPER",
          member: "0xdad787d5a86f37a5e480e35b3ca615d46242ce9b",
        },
        {
          role: "ORDER_KEEPER",
          member: "0x56a7ce61d8ab46a27de1837ceddd8522d52d2736",
        },
        {
          role: "ORDER_KEEPER",
          member: "0xc9a5775951f0ea25053fee81d935fbbf4f0fb273",
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

  // signalGrantRole and signalRevokeRole in case the granting / revocation of roles needs to be reverted
  if (timelockMethod === "signalGrantRole" || timelockMethod === "signalRevokeRole") {
    const roles = timelockMethod === "signalGrantRole" ? networkConfig.rolesToAdd : networkConfig.rolesToRemove;
    for (const { member, role, contractName } of roles) {
      console.log("%s %s %s %s", timelockMethod, member, role, contractName);
      multicallWriteParams.push(timelock.interface.encodeFunctionData("signalRevokeRole", [member, hashString(role)]));
      multicallWriteParams.push(timelock.interface.encodeFunctionData("signalGrantRole", [member, hashString(role)]));
    }
  }

  if (timelockMethod === "grantRoleAfterSignal") {
    for (const { member, role, contractName } of networkConfig.rolesToAdd) {
      console.log("%s %s %s %s", timelockMethod, member, role, contractName);
      multicallWriteParams.push(timelock.interface.encodeFunctionData(timelockMethod, [member, hashString(role)]));
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
