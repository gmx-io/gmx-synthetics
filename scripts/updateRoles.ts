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
    return await ethers.getContractAt("Timelock", "0xf32b417A93Acc039B236F1eCC86B56bd3cB8E698");
  }

  if (network === "avalanche") {
    return await ethers.getContractAt("Timelock", "0x9Dd6EB1069385D85Ae204543BabB7333181ec8A5");
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
        member: "0xe37d052e1deb99901de205e7186e31a36e4ef70c",
      },
      {
        role: "CONTROLLER",
        member: "0x55e8e153048294c060455e5762d7280faee86dc7",
      },
      {
        role: "CONTROLLER",
        member: "0x7a967d114b8676874fa2cfc1c14f3095c88418eb",
      },
      {
        role: "CONTROLLER",
        member: "0x9cbb37630d65324af064f28ccd9df6e667cb16f1",
      },
      {
        role: "CONTROLLER",
        member: "0x9242fbed25700e82ae26ae319bcf68e9c508451c",
      },
      {
        role: "CONTROLLER",
        member: "0xfe2df84627950a0fb98ead49c69a1de3f66867d6",
      },
      {
        role: "CONTROLLER",
        member: "0x64fbd82d9f987baf5a59401c64e823232182e8ed",
      },
      {
        role: "CONTROLLER",
        member: "0xe68caaacdf6439628dfd2fe624847602991a31eb",
      },
      {
        role: "CONTROLLER",
        member: "0x674ee2ffe588c4b1fde6d5481c55ef6133004cba",
      },
      {
        role: "CONTROLLER",
        member: "0x7cc506c8d711c2a17b61a75bd082d2514160baad",
      },
      {
        role: "CONTROLLER",
        member: "0xdab9ba9e3a301ccb353f18b4c8542ba2149e4010",
      },
      {
        role: "CONTROLLER",
        member: "0xa329221a77be08485f59310b873b14815c82e10d",
      },
      {
        role: "CONTROLLER",
        member: "0x48787f7847068f9cc1398e5f589bef9744730c8d",
      },
      {
        role: "CONTROLLER",
        member: "0x3f6df0c3a7221ba1375e87e7097885a601b41afc",
      },
      {
        role: "CONTROLLER",
        member: "0xd59a808bca24812c483c1b3bf0a0e8d7d5932e4c",
      },
      {
        role: "ROLE_ADMIN",
        member: "0x7a967d114b8676874fa2cfc1c14f3095c88418eb",
      },
      {
        role: "ROUTER_PLUGIN",
        member: "0x674ee2ffe588c4b1fde6d5481c55ef6133004cba",
      },
      {
        role: "ROUTER_PLUGIN",
        member: "0xa329221a77be08485f59310b873b14815c82e10d",
      },
      {
        role: "ROUTER_PLUGIN",
        member: "0xd59a808bca24812c483c1b3bf0a0e8d7d5932e4c",
      },
    ],
    avalanche: [
      {
        role: "CONTROLLER",
        member: "0x1ad2560bd34d17a413e4eb9420643d1782466dda",
      },
      {
        role: "CONTROLLER",
        member: "0xcf71721924c312374bf8366c3f60a127a1e80e3c",
      },
      {
        role: "CONTROLLER",
        member: "0xdf23692341538340db0ff04c65017f51b69a29f6",
      },
      {
        role: "CONTROLLER",
        member: "0x81d8b0f2fd89d31728e8fe36fa3c9ad8bacf10dc",
      },
      {
        role: "CONTROLLER",
        member: "0x129174043b134ad27eae552d6bea08f23f771205",
      },
      {
        role: "CONTROLLER",
        member: "0x8ae344deed1526b1772addf78718722a169288dc",
      },
      {
        role: "CONTROLLER",
        member: "0x1b0a44dd3bccc2ddae33921694ebc34e3ecc1415",
      },
      {
        role: "CONTROLLER",
        member: "0x088711c3d2fa992188125e009e65c726ba090ad6",
      },
      {
        role: "CONTROLLER",
        member: "0xe60b7526e05d8d8aea17607245fd6d7c9953a1ca",
      },
      {
        role: "CONTROLLER",
        member: "0x775caaa2cb635a56c6c3dfb9c65b5fa6335f79e7",
      },
      {
        role: "CONTROLLER",
        member: "0x34acbf9fb2f0ddab489f6b75fbf394c240b97276",
      },
      {
        role: "CONTROLLER",
        member: "0x5aeb6ad978f59e220aa9099e09574e1c5e03aafd",
      },
      {
        role: "CONTROLLER",
        member: "0x418f9cc6ca4870be1088ce03cc48985b145c79a8",
      },
      {
        role: "CONTROLLER",
        member: "0x48486caf8851ed0085432789d28a8820becbfd45",
      },
      {
        role: "CONTROLLER",
        member: "0x2098465fc0329c4d2f3b266190a6a664fbc6e0db",
      },
      {
        role: "ROLE_ADMIN",
        member: "0xdf23692341538340db0ff04c65017f51b69a29f6",
      },
      {
        role: "ROUTER_PLUGIN",
        member: "0xe60b7526e05d8d8aea17607245fd6d7c9953a1ca",
      },
      {
        role: "ROUTER_PLUGIN",
        member: "0x5aeb6ad978f59e220aa9099e09574e1c5e03aafd",
      },
      {
        role: "ROUTER_PLUGIN",
        member: "0x2098465fc0329c4d2f3b266190a6a664fbc6e0db",
      },
    ],
  };

  const rolesToRemove = {
    arbitrum: [
      {
        role: "CONTROLLER",
        member: "0x9F48160eDc3Ad78F4cA0E3FDF54A75D8FB228452",
      },
      {
        role: "CONTROLLER",
        member: "0x08A902113F7F41a8658eBB1175f9c847bf4fB9D8",
      },
      {
        role: "CONTROLLER",
        member: "0xEa90EC1228F7D1b3D47D84d1c9D46dBDFEfF7709",
      },
      {
        role: "CONTROLLER",
        member: "0x55E9A5E1Aed46500F746F7683e87F3D9f3C1E14E",
      },
      {
        role: "CONTROLLER",
        member: "0x69C527fC77291722b52649E45c838e41be8Bf5d5",
      },
      {
        role: "CONTROLLER",
        member: "0xB0Fc2a48b873da40e7bc25658e5E6137616AC2Ee",
      },
      {
        role: "CONTROLLER",
        member: "0xA19fA3F0D8E7b7A8963420De504b624167e709B2",
      },
      {
        role: "CONTROLLER",
        member: "0x321f3739983CC3E911fd67a83d1ee76238894Bd0",
      },
      {
        role: "CONTROLLER",
        member: "0x26BC03c944A4800299B4bdfB5EdCE314dD497511",
      },
      {
        role: "CONTROLLER",
        member: "0xb0c681DE9CB4B75eD0A620c04A958Bc05f4087b7",
      },
      {
        role: "CONTROLLER",
        member: "0x4895170e184441da9BD2bF95c120c07ba628eeF0",
      },
      {
        role: "CONTROLLER",
        member: "0xf32b417A93Acc039B236F1eCC86B56bd3cB8E698",
      },
      {
        role: "CONTROLLER",
        member: "0x8583b878DA0844B7f59974069f00D3A9eaE0F4ae",
      },
      {
        role: "CONTROLLER",
        member: "0x7d36FE0840140Aa2bb45711d8EC228e77F597493",
      },
      {
        role: "CONTROLLER",
        member: "0x26DdDaA629Bb35FC1853d051561f2200dD190588",
      },
      {
        role: "CONTROLLER",
        member: "0x75eAFD2B4e306Dad8dd6334456F8018218Bc9882",
      },
      {
        role: "CONTROLLER",
        member: "0xFf10Ff89195191d22F7B934A5E1Cd581Ec0Ccb93",
      },
      {
        role: "CONTROLLER",
        member: "0x43F0080E40A32A44413fd562788c27E3f5BEddbC",
      },
      {
        role: "CONTROLLER",
        member: "0x31FaBf54278E79069c4E102e9fB79d6a44be53A8",
      },
      {
        role: "GOV_TOKEN_CONTROLLER",
        member: "0x159854e14A862Df9E39E1D128b8e5F70B4A3cE9B",
      },
      {
        role: "ROLE_ADMIN",
        member: "0xf32b417A93Acc039B236F1eCC86B56bd3cB8E698",
      },
      {
        role: "ROUTER_PLUGIN",
        member: "0x9F48160eDc3Ad78F4cA0E3FDF54A75D8FB228452",
      },
      {
        role: "ROUTER_PLUGIN",
        member: "0x69C527fC77291722b52649E45c838e41be8Bf5d5",
      },
      {
        role: "ROUTER_PLUGIN",
        member: "0x75eAFD2B4e306Dad8dd6334456F8018218Bc9882",
      },
    ],
    avalanche: [
      {
        role: "CONTROLLER",
        member: "0xe5485a4fD6527911e9b82A75A1bFEd6e47BE2241",
      },
      {
        role: "CONTROLLER",
        member: "0x0E9A0419e5144fe3C73fF30446a1e4d04E1224F0",
      },
      {
        role: "CONTROLLER",
        member: "0xcf2fFD3FC8d2cf78D087681f9acD35c799E0d88d",
      },
      {
        role: "CONTROLLER",
        member: "0x7dA618EE7b32af18B749a3715332DBcD820D0913",
      },
      {
        role: "CONTROLLER",
        member: "0x3BE24AED1a4CcaDebF2956e02C27a00726D4327d",
      },
      {
        role: "CONTROLLER",
        member: "0x32A0258007a6ea78265a5AE4DBb28f176be4a8EB",
      },
      {
        role: "CONTROLLER",
        member: "0xd1b861B50f8d8F9dd922453d1234A2AbDf4d4ea5",
      },
      {
        role: "CONTROLLER",
        member: "0xAe2453Dca7704080052AF3c212E862cab50d65C0",
      },
      {
        role: "CONTROLLER",
        member: "0x352f684ab9e97a6321a13CF03A61316B681D9fD2",
      },
      {
        role: "CONTROLLER",
        member: "0xb54C8fB6B2F143dD58f5B00fDE7dA4FA05077B20",
      },
      {
        role: "CONTROLLER",
        member: "0x28AD6fF2683a3D36C05F1D9ec95b907086431a27",
      },
      {
        role: "CONTROLLER",
        member: "0x9Dd6EB1069385D85Ae204543BabB7333181ec8A5",
      },
      {
        role: "CONTROLLER",
        member: "0x8EfE46827AADfe498C27E56F0A428B5B4EE654f7",
      },
      {
        role: "CONTROLLER",
        member: "0x162e3a5B47C9a45ff762E5b4b23D048D6780C14e",
      },
      {
        role: "CONTROLLER",
        member: "0x989618BE5450B40F7a2675549643E2e2Dab9978A",
      },
      {
        role: "CONTROLLER",
        member: "0xe75f1fA4858A99e07ca878388AE9259Ba048C87A",
      },
      {
        role: "CONTROLLER",
        member: "0x9ab8b533B817C41506999D6ff05d25079B0A38cc",
      },
      {
        role: "CONTROLLER",
        member: "0xEa90EC1228F7D1b3D47D84d1c9D46dBDFEfF7709",
      },
      {
        role: "GOV_TOKEN_CONTROLLER",
        member: "0xa192D0681E2b9484d1fA48083D36B8A2D0Da1809",
      },
      {
        role: "ROLE_ADMIN",
        member: "0x9Dd6EB1069385D85Ae204543BabB7333181ec8A5",
      },
      {
        role: "ROUTER_PLUGIN",
        member: "0xe5485a4fD6527911e9b82A75A1bFEd6e47BE2241",
      },
      {
        role: "ROUTER_PLUGIN",
        member: "0x3BE24AED1a4CcaDebF2956e02C27a00726D4327d",
      },
      {
        role: "ROUTER_PLUGIN",
        member: "0xEa90EC1228F7D1b3D47D84d1c9D46dBDFEfF7709",
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
