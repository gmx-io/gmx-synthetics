/*
Updates synthetic keepers as handlers on ReferralStorage, so they can (or can no longer)
call setTraderReferralCode on behalf of users.

syntheticKeepers below is the desired state per address:
  true  --> should be a handler (enable)
  false --> should not be a handler (disable)

The script reads each address's desired state and emits a setHandler tx only for the ones whose
on-chain state differs. To disable some/all keepers later, flip their flag to false and rerun.

Mainnet flow:
- gov of ReferralStorage is the ReferralStorageTimelock; setHandler is one-step onlyAdmin
  (no signalSetHandler, no delay), even though setGov / setMinter / setKeeper require signal + delay.
- writes out/safe-batch-updateReferralStorageHandlers-setHandler-<network>-<stamp>.json with one
  setHandler(referralStorage, keeper, true|false) tx per keeper, to be loaded in Safe Tx Builder.

Testnet flow (arbitrumSepolia):
- gov is MockTimelockV1; admin is the deployer EOA running this script.
- sends setHandler txs directly, one per changed keeper, after a confirm prompt.

Usage:
  # mainnet (writes Safe batch JSON, does not broadcast)
  npx hardhat run --network arbitrum scripts/updateReferralStorageHandlers.ts

  # testnet (broadcasts directly from the admin EOA)
  npx hardhat run --network arbitrumSepolia scripts/updateReferralStorageHandlers.ts
*/

import hre from "hardhat";
import prompts from "prompts";

import { isExistingMainnetDeployment } from "../config/chains";
import { getExistingContractAddresses } from "../config/overwrite";
import { inputsOf, writeSafeBatchJson } from "../utils/safeTx";

// Desired handler state per synthetic keeper EOA (true = handler, false = not).
// Addresses copied from config/roles.ts -> syntheticKeepers.mainnet
// Flip an entry to false to disable that keeper.
const syntheticKeepers: Record<string, boolean> = {
  "0xE47b36382DC50b90bCF6176Ddb159C4b9333A7AB": true,
  "0xC539cB358a58aC67185BaAD4d5E3f7fCfc903700": true,
  "0xf1e1B2F4796d984CCb8485d43db0c64B83C1FA6d": true,
  "0xdE10336a5C37Ab8FBfd6cd53bdECa5b0974737ba": true,
  "0xeB2a53FF17a747B6000041FB4919B3250f2892E3": true,
  "0x8808c5E5Bc9317Bf8cb5eE62339594b8d95f77df": true,
  "0x8E66ee36F2C7B9461F50aA0b53eF0E4e47F4ABBf": true,
  "0x6A2B3A13be0c723674BCfd722d4e133b3f356e05": true,
  "0xDd5c59B7C4e8faD38732caffbeBd20a61bf9F3FC": true,
  "0xEB2bB25dDd2B1872D5189Ae72fCeC9b160dD3FB2": true,
  "0xa17A86388BBcE9fd73a67F66D87FB0222A824c3f": true,
  "0x86fe53a6D47d9a0fDEA4C5Ac3D80E0E6CC3354cc": true,
  "0x8E2e2Dd583e7DB8437164A7F89A7288b999253CB": true,
  "0xC0a53a9Ee8E8ea0f585d8DcF26800EF2841f97fD": true,
  "0xd316a0043056fb787dE34ABA8cd5323f5C6f8c47": true,
  "0xB874e07336Edc0c278C276FfEb08818976099256": true,
  "0xa5E4a14CaB506bA102977648317E0622cA60BB64": true,
  "0xdAD787D5a86f37a5E480e35b3Ca615D46242Ce9B": true,
  "0x56a7CE61D8aB46A27De1837ceddd8522D52D2736": true,
  "0xC9A5775951F0ea25053fEe81D935FBBF4F0Fb273": true,
};

export async function main() {
  const isMainnet = isExistingMainnetDeployment(hre);

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

  // Only act on keepers whose on-chain state differs from the desired state.
  const changes: { keeper: string; isActive: boolean }[] = [];
  for (const [keeper, desired] of Object.entries(syntheticKeepers)) {
    const current = await referralStorage.isHandler(keeper);
    if (current === desired) {
      console.log(`  ${keeper}  already ${desired ? "a handler" : "not a handler"}, skipping`);
    } else {
      changes.push({ keeper, isActive: desired });
    }
  }
  if (changes.length === 0) {
    console.log("\nAll keepers already in desired state on ReferralStorage.");
    return;
  }

  const toEnable = changes.filter((c) => c.isActive).length;
  const toDisable = changes.length - toEnable;

  console.log(`\n=== ${changes.length} change(s) on ${hre.network.name}: ${toEnable} enable, ${toDisable} disable ===`);
  console.log(`Timelock (gov):  ${govAddress}`);
  console.log(`ReferralStorage: ${referralStorage.address}`);
  changes.forEach((c) => console.log(`  ${c.isActive ? "enable " : "disable"} ${c.keeper}`));

  if (isMainnet) {
    const safeBatchTransactions = changes.map(({ keeper, isActive }) => ({
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
        _isActive: isActive ? "true" : "false",
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
      message: `Send ${changes.length} setHandler tx(s) to ${hre.network.name}?`,
    });
    if (!write) {
      console.log("Aborted.");
      return;
    }

    console.log(`\n--> Testnet flow: direct setHandler calls from admin EOA`);
    for (const { keeper, isActive } of changes) {
      const tx = await gov.setHandler(referralStorage.address, keeper, isActive);
      console.log(`  setHandler ${keeper} ${isActive} --> ${tx.hash}`);
      await tx.wait();
    }
  }

  console.log(`\nDone. ${changes.length} change(s).`);
}

main().catch((ex) => {
  console.error(ex);
  process.exit(1);
});
