/*
Enables synthetic keepers as handlers on ReferralStorage, so they can call setTraderReferralCode
on behalf of users.

Reads keeper EOAs from out/synthetic-keepers.json. Skips any keeper that is already a handler.

Mainnet flow:
- gov of ReferralStorage is the ReferralStorageTimelock; setHandler is one-step onlyAdmin
  (no signalSetHandler, no delay), even though setGov / setMinter / setKeeper require signal + delay.
- writes out/safe-batch-updateReferralStorageHandlers-setHandler-<network>-<stamp>.json with one
  setHandler(referralStorage, keeper, true) tx per keeper, to be loaded in Safe Tx Builder.

Testnet flow (arbitrumSepolia):
- gov is MockTimelockV1; admin is the deployer EOA running this script.
- sends setHandler txs directly, one per keeper, after a confirm prompt.

Usage:
  # mainnet (writes Safe batch JSON, does not broadcast)
  npx hardhat run --network arbitrum scripts/updateReferralStorageHandlers.ts

  # testnet (broadcasts directly from the admin EOA)
  npx hardhat run --network arbitrumSepolia scripts/updateReferralStorageHandlers.ts
*/

import fs from "fs";
import path from "path";
import hre from "hardhat";
import prompts from "prompts";

import { isExistingMainnetDeployment } from "../config/chains";
import { getExistingContractAddresses } from "../config/overwrite";
import { inputsOf, writeSafeBatchJson } from "../utils/safeTx";

// Format:
// e.g. { "arbitrum": ["0x...", "0x..."], "arbitrumSepolia": ["0x..."] }
const KEEPERS_FILE = path.resolve(__dirname, "../out/synthetic-keepers.json");

export async function main() {
  const isMainnet = isExistingMainnetDeployment(hre);

  const keepersByNetwork: Record<string, string[]> = JSON.parse(fs.readFileSync(KEEPERS_FILE, "utf8"));
  const allKeepers = keepersByNetwork[hre.network.name];
  if (!allKeepers || allKeepers.length === 0) {
    throw new Error(`No keepers configured for ${hre.network.name} in ${KEEPERS_FILE}`);
  }

  const referralStorage = isMainnet
    ? await hre.ethers.getContractAt(
        "ReferralStorage",
        getExistingContractAddresses(hre.network).ReferralStorage.address
      )
    : await hre.ethers.getContract("ReferralStorage");

  const govAddress = await referralStorage.gov();
  // Inline ABI so the param names land in the Safe Tx Builder JSON; contracts/mock/MockTimelock.sol
  // declares the same functions but leaves params unnamed, which breaks Safe's input/value pairing.
  const gov = await hre.ethers.getContractAt(
    [
      "function setHandler(address _target, address _handler, bool _isActive) external",
      "function admin() external view returns (address)",
    ],
    govAddress
  );

  const keepers: string[] = [];
  for (const keeper of allKeepers) {
    const already = await referralStorage.isHandler(keeper);
    if (already) {
      console.log(`  ${keeper}  already a handler, skipping`);
    } else {
      keepers.push(keeper);
    }
  }
  if (keepers.length === 0) {
    console.log("\nAll keepers already handlers on ReferralStorage.");
    return;
  }

  console.log(`\n=== ${keepers.length}/${allKeepers.length} keeper(s) to enable on ${hre.network.name} ===`);
  console.log(`Timelock (gov):  ${govAddress}`);
  console.log(`ReferralStorage: ${referralStorage.address}`);
  keepers.forEach((k) => console.log(`  ${k}`));

  if (isMainnet) {
    const safeBatchTransactions = keepers.map((keeper) => ({
      to: govAddress,
      value: "0",
      data: null,
      contractMethod: {
        name: "setHandler",
        payable: false,
        inputs: inputsOf(gov, "setHandler"),
      },
      contractInputsValues: {
        _target: referralStorage.address,
        _handler: keeper,
        _isActive: "true",
      },
    }));

    console.log(`\n--> Mainnet flow: Safe batch JSON for the Protocol Multisig`);
    writeSafeBatchJson({
      scriptName: "updateReferralStorageHandlers",
      label: "setHandler",
      transactions: safeBatchTransactions,
      createdFromSafeAddress: await gov.admin(), // GMX Protocol Multisig
    });
  } else {
    const { write } = await prompts({
      type: "confirm",
      name: "write",
      message: `Send ${keepers.length} setHandler tx(s) to ${hre.network.name}?`,
    });
    if (!write) {
      console.log("Aborted.");
      return;
    }

    console.log(`\n--> Testnet flow: direct setHandler calls from admin EOA`);
    for (const keeper of keepers) {
      const tx = await gov.setHandler(referralStorage.address, keeper, true);
      console.log(`  setHandler ${keeper} --> ${tx.hash}`);
      await tx.wait();
    }
  }

  console.log(`\nDone. ${keepers.length} keeper(s).`);
}

main().catch((ex) => {
  console.error(ex);
  process.exit(1);
});
