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
    return await ethers.getContractAt("Timelock", "0x2ECB664e934aCd5DF1EE889Dbb2E7D6C1d7CE3Cb");
  }

  if (network === "avalanche") {
    return await ethers.getContractAt("Timelock", "0x844D38f2c3875b8351feB4764718E1c64bD55c46");
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
    arbitrum: [],
    avalanche: [],
  };

  // const rolesToRemove = {
  //   arbitrum: [
  //     {
  //       role: "CONTROLLER",
  //       member: "0x7C68C7866A64FA2160F78EEaE12217FFbf871fa8",
  //     },
  //     {
  //       role: "ROUTER_PLUGIN",
  //       member: "0x7C68C7866A64FA2160F78EEaE12217FFbf871fa8",
  //     },
  //     {
  //       role: "CONTROLLER",
  //       member: "0x78F414436148B8588BDEe4771EA5eB75148668aa",
  //     },
  //     {
  //       role: "ROUTER_PLUGIN",
  //       member: "0x78F414436148B8588BDEe4771EA5eB75148668aa",
  //     },
  //   ],
  //   avalanche: [
  //     {
  //       role: "CONTROLLER",
  //       member: "0x11E590f6092D557bF71BaDEd50D81521674F8275",
  //     },
  //     {
  //       role: "ROUTER_PLUGIN",
  //       member: "0x11E590f6092D557bF71BaDEd50D81521674F8275",
  //     },
  //     {
  //       role: "CONTROLLER",
  //       member: "0xA60862ecc8bd976519e56231bDfAF697C5ce2156",
  //     },
  //     {
  //       role: "ROUTER_PLUGIN",
  //       member: "0xA60862ecc8bd976519e56231bDfAF697C5ce2156",
  //     },
  //   ],
  // };

  const rolesToRemove = {
    arbitrum: [
      {
        role: "CONTROLLER",
        member: "0x9e0521C3dbB18E849F4955087E065E5C9C879917",
      },
      {
        role: "CONTROLLER",
        member: "0xbF56A2F030C3F920F0E2aD9Cf456B9954c49383a",
      },
      {
        role: "CONTROLLER",
        member: "0x352f684ab9e97a6321a13CF03A61316B681D9fD2",
      },
      {
        role: "CONTROLLER",
        member: "0x9E32088F3c1a5EB38D32d1Ec6ba0bCBF499DC9ac",
      },
      {
        role: "CONTROLLER",
        member: "0x9Dc4f12Eb2d8405b499FB5B8AF79a5f64aB8a457",
      },
      {
        role: "CONTROLLER",
        member: "0x8514fc704317057FA86961Ba9b9490956993A5ed",
      },
      {
        role: "CONTROLLER",
        member: "0xF6b804F6Cc847a22F2D022C9b0373190850bE34D",
      },
      {
        role: "CONTROLLER",
        member: "0xa11B501c2dd83Acd29F6727570f2502FAaa617F2",
      },
      {
        role: "CONTROLLER",
        member: "0x62aB76Ed722C507f297f2B97920dCA04518fe274",
      },
      {
        role: "CONTROLLER",
        member: "0x226ED647C6eA2C0cE4C08578e2F37b8c2F922849",
      },
      {
        role: "CONTROLLER",
        member: "0x1847C11d9B11aDDb48e4bB2b55fCE6F9D1606039",
      },
      {
        role: "ROLE_ADMIN",
        member: "0x62aB76Ed722C507f297f2B97920dCA04518fe274",
      },
    ],
    avalanche: [
      {
        role: "CONTROLLER",
        member: "0x7309223E21dc2FFbb660E5Bd5aBF95ae06ba4Da0",
      },
      {
        role: "CONTROLLER",
        member: "0x931C18AF613f56289253F0EeD57F315dE7dbAFcd",
      },
      {
        role: "CONTROLLER",
        member: "0xc7D8E3561f1247EBDa491bA5f042699C2807C33C",
      },
      {
        role: "CONTROLLER",
        member: "0xd3B6E962f135634C43415d57A28E688Fb4f15A58",
      },
      {
        role: "CONTROLLER",
        member: "0x790Ee987b9B253374d700b07F16347a7d4C4ff2e",
      },
      {
        role: "CONTROLLER",
        member: "0x72fa3978E2E330C7B2debc23CB676A3ae63333F6",
      },
      {
        role: "CONTROLLER",
        member: "0x5c5DBbcDf420B5d81d4FfDBa5b26Eb24E6E60d52",
      },
      {
        role: "CONTROLLER",
        member: "0xEE027373517a6D96Fe62f70E9A0A395cB5a39Eee",
      },
      {
        role: "CONTROLLER",
        member: "0x090FA7eb8B4647DaDbEA315E68f8f88e8E62Bd54",
      },
      {
        role: "CONTROLLER",
        member: "0x4Db91a1Fa4ba3c75510B2885d7d7da48E0209F38",
      },
      {
        role: "CONTROLLER",
        member: "0xb964d8f746fA13024aEEDAeF1d015698bbD0cFCE",
      },
      {
        role: "ROLE_ADMIN",
        member: "0x4Db91a1Fa4ba3c75510B2885d7d7da48E0209F38",
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
