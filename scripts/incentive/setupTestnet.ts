/*
Completes post-deploy incentive vault wiring on testnets.

Hardhat deploy leaves EsGmxIssuer.vester unset and SeasonRatioVester.isIssuerBindingConfirmed
false on purpose: setVester is one-shot TIMELOCK_ADMIN. This script:

  1. binds EsGmxIssuer -> SeasonRatioVester (TIMELOCK_ADMIN)
  2. confirms the binding (permissionless after step 1)
  3. grants INCENTIVE_ADMIN to the signer if missing (ROLE_ADMIN)
  4. marks provisioning complete on both vesters (INCENTIVE_ADMIN)
  5. whitelists issuer + vesters as handlers on mock esGMX
  6. tops up mock GMX backing on both vesters and mock esGMX on the issuer

Orphan stays issuer-unbound. Idempotent: already-applied steps are skipped.

Usage:
  npx hardhat run --network arbitrumSepolia scripts/incentive/setupTestnet.ts
  WRITE=true npx hardhat run --network arbitrumSepolia scripts/incentive/setupTestnet.ts

Optional:
  BACKING_TOKENS=1000000   mock GMX / esGMX top-up target (default 1_000_000)
*/

import hre from "hardhat";
import prompts from "prompts";
import { Contract } from "ethers";

import { hashString } from "../../utils/hash";
import { isIncentiveTestnet } from "../../utils/incentive";
import { expandDecimals } from "../../utils/math";

let write = process.env.WRITE === "true";

const DEFAULT_BACKING_TOKENS = "1000000";

type PlannedAction = {
  label: string;
  send: () => Promise<unknown>;
};

async function send(label: string, txPromise: Promise<{ hash: string; wait: () => Promise<unknown> }>) {
  const tx = await txPromise;
  console.log(`  ${label}  ${tx.hash}`);
  await tx.wait();
}

async function hasRole(roleStore: Contract, account: string, role: string): Promise<boolean> {
  return roleStore.hasRole(account, hashString(role));
}

async function main() {
  if (!isIncentiveTestnet(hre)) {
    throw new Error(
      `refusing to run on ${hre.network.name}; incentive testnet setup is for arbitrumSepolia / avalancheFuji`
    );
  }

  const { deployer } = await hre.getNamedAccounts();
  const signer = await hre.ethers.getSigner(deployer);
  const backingTarget = expandDecimals(process.env.BACKING_TOKENS || DEFAULT_BACKING_TOKENS, 18);

  const roleStore = await hre.ethers.getContract("RoleStore", signer);
  const issuer = await hre.ethers.getContract("EsGmxIssuer", signer);
  const season = await hre.ethers.getContract("SeasonRatioVester", signer);
  const orphan = await hre.ethers.getContract("OrphanRatioVester", signer);
  const esGmx = await hre.ethers.getContractAt(
    "MockEsGmxV1",
    (
      await hre.deployments.get("IncentiveEsGmx")
    ).address,
    signer
  );
  const gmx = await hre.ethers.getContractAt(
    "MintableToken",
    (
      await hre.deployments.get("IncentiveClaimableToken")
    ).address,
    signer
  );

  const [issuerVester, seasonIssuer, bindingConfirmed, seasonProvisioning, orphanIssuer, orphanProvisioning] =
    await Promise.all([
      issuer.vester(),
      season.issuer(),
      season.isIssuerBindingConfirmed(),
      season.provisioningComplete(),
      orphan.issuer(),
      orphan.provisioningComplete(),
    ]);

  if (seasonIssuer.toLowerCase() !== issuer.address.toLowerCase()) {
    throw new Error(
      `SeasonRatioVester.issuer is ${seasonIssuer}, expected EsGmxIssuer ${issuer.address}; redeploy vesters before setup`
    );
  }
  if (orphanIssuer !== hre.ethers.constants.AddressZero) {
    throw new Error(`OrphanRatioVester.issuer is ${orphanIssuer}, expected zero address`);
  }
  if (
    issuerVester !== hre.ethers.constants.AddressZero &&
    issuerVester.toLowerCase() !== season.address.toLowerCase()
  ) {
    throw new Error(`EsGmxIssuer.vester is already ${issuerVester}, not SeasonRatioVester ${season.address}`);
  }

  const signerHasTimelockAdmin = await hasRole(roleStore, signer.address, "TIMELOCK_ADMIN");
  const signerHasRoleAdmin = await hasRole(roleStore, signer.address, "ROLE_ADMIN");
  const signerHasIncentiveAdmin = await hasRole(roleStore, signer.address, "INCENTIVE_ADMIN");
  const canCompleteProvisioning = signerHasIncentiveAdmin || signerHasRoleAdmin;

  console.log(`\n=== incentive testnet setup on ${hre.network.name} ===`);
  console.log(`signer:                 ${signer.address}`);
  console.log(`EsGmxIssuer:            ${issuer.address}`);
  console.log(`SeasonRatioVester:      ${season.address}`);
  console.log(`OrphanRatioVester:      ${orphan.address}`);
  console.log(`IncentiveEsGmx:         ${esGmx.address}`);
  console.log(`IncentiveClaimableToken: ${gmx.address}`);
  console.log(`issuer.vester:          ${issuerVester}`);
  console.log(`season binding:         ${bindingConfirmed}`);
  console.log(`season provisioning:    ${seasonProvisioning}`);
  console.log(`orphan provisioning:    ${orphanProvisioning}`);
  console.log(`TIMELOCK_ADMIN:         ${signerHasTimelockAdmin}`);
  console.log(`ROLE_ADMIN:             ${signerHasRoleAdmin}`);
  console.log(`INCENTIVE_ADMIN:        ${signerHasIncentiveAdmin}`);

  const actions: PlannedAction[] = [];

  if (issuerVester === hre.ethers.constants.AddressZero) {
    if (!signerHasTimelockAdmin) {
      throw new Error(`signer ${signer.address} needs TIMELOCK_ADMIN to call EsGmxIssuer.setVester`);
    }
    actions.push({
      label: `EsGmxIssuer.setVester(${season.address})`,
      send: () => send("setVester", issuer.setVester(season.address)),
    });
  } else {
    console.log("  setVester already applied, skipping");
  }

  if (!bindingConfirmed) {
    actions.push({
      label: "SeasonRatioVester.confirmIssuerBinding()",
      send: () => send("confirmIssuerBinding", season.confirmIssuerBinding()),
    });
  } else {
    console.log("  confirmIssuerBinding already applied, skipping");
  }

  if (!signerHasIncentiveAdmin) {
    if (!signerHasRoleAdmin) {
      console.log(`  INCENTIVE_ADMIN missing on ${signer.address}; ROLE_ADMIN required to grant it, skipping`);
    } else {
      actions.push({
        label: `RoleStore.grantRole(${signer.address}, INCENTIVE_ADMIN)`,
        send: () => send("grant INCENTIVE_ADMIN", roleStore.grantRole(signer.address, hashString("INCENTIVE_ADMIN"))),
      });
    }
  }

  const markProvisioning = (vester: Contract, name: string, alreadyComplete: boolean) => {
    if (alreadyComplete) {
      console.log(`  ${name}.setProvisioningComplete already applied, skipping`);
      return;
    }
    if (!canCompleteProvisioning) {
      console.log(`  skipping ${name}.setProvisioningComplete (signer lacks INCENTIVE_ADMIN / ROLE_ADMIN)`);
      return;
    }
    actions.push({
      label: `${name}.setProvisioningComplete()`,
      send: () => send(`${name}.setProvisioningComplete`, vester.setProvisioningComplete()),
    });
  };
  markProvisioning(season, "SeasonRatioVester", seasonProvisioning);
  markProvisioning(orphan, "OrphanRatioVester", orphanProvisioning);

  const handlers: { name: string; address: string }[] = [
    { name: "EsGmxIssuer", address: issuer.address },
    { name: "SeasonRatioVester", address: season.address },
    { name: "OrphanRatioVester", address: orphan.address },
  ];
  for (const handler of handlers) {
    if (await esGmx.isHandler(handler.address)) {
      console.log(`  mock esGMX handler ${handler.name} already set, skipping`);
      continue;
    }
    actions.push({
      label: `IncentiveEsGmx.setHandler(${handler.name}, true)`,
      send: () => send(`setHandler ${handler.name}`, esGmx.setHandler(handler.address, true)),
    });
  }

  const topUp = async (token: Contract, tokenLabel: string, recipient: string, recipientLabel: string) => {
    const balance = await token.balanceOf(recipient);
    if (balance.gte(backingTarget)) {
      console.log(`  ${recipientLabel} already holds ${balance} ${tokenLabel}, skipping mint`);
      return;
    }
    const amount = backingTarget.sub(balance);
    actions.push({
      label: `mint ${amount} ${tokenLabel} to ${recipientLabel}`,
      send: () => send(`mint ${tokenLabel} -> ${recipientLabel}`, token.mint(recipient, amount)),
    });
  };
  await topUp(gmx, "GMX", season.address, "SeasonRatioVester");
  await topUp(gmx, "GMX", orphan.address, "OrphanRatioVester");
  await topUp(esGmx, "esGMX", issuer.address, "EsGmxIssuer");

  if (actions.length === 0) {
    console.log("\nAlready complete. No transactions.");
    return;
  }

  console.log(`\n=== ${actions.length} action(s) ===`);
  actions.forEach((action, i) => console.log(`  ${i + 1}. ${action.label}`));

  if (!write) {
    ({ write } = await prompts({
      type: "confirm",
      name: "write",
      message: `Send ${actions.length} tx(s) to ${hre.network.name}?`,
    }));
  }
  if (!write) {
    console.log("Aborted.");
    return;
  }

  for (const action of actions) {
    await action.send();
  }

  console.log("\n=== after ===");
  console.log(`issuer.vester:       ${await issuer.vester()}`);
  console.log(`season binding:      ${await season.isIssuerBindingConfirmed()}`);
  console.log(`season provisioning: ${await season.provisioningComplete()}`);
  console.log(`orphan provisioning: ${await orphan.provisioningComplete()}`);
  console.log("Done.");
}

main().catch((ex) => {
  console.error(ex);
  process.exit(1);
});
