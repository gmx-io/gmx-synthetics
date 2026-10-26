import { ethers } from "ethers";

import {
  REWARD_ROUTER_V2,
  getProvider,
  getRouterAddresses,
  getReferralVester,
  collectTransferCounterparties,
  assertArbitrum,
} from "./lib";
import { getDeployment, readOutFile, writeOutFile, multiRead, multiReadStrict } from "./migrationLib";

// Orphan provisioning snapshot at one fixed block (step 6): per account, un-vested
// legacy esGMX = wallet + staked + accrued tracker claimable + multichain vault balance.
// Open legacy vesting positions are excluded (they keep vesting in V1 and a withdrawal
// forfeits the allocation) and reported per account for reconciliation only. Candidates union the esGMX,
// staked-receipt, and vester token Transfer counterparties (an acceptTransfer receiver
// never appears in esGMX logs) plus an optional out/multichain-balances.json merge;
// wallet attribution reconciles against totalSupply so any gap is reported.
// env: INCENTIVE_RPC (log scan), SNAPSHOT_STATE_RPC (archive endpoint for the pinned reads, default INCENTIVE_RPC),
//      SNAPSHOT_BLOCK (required for the real run), FROM_BLOCK, CHUNK,
//      NETWORK_NAME, ISSUANCE_BEFORE_SNAPSHOT=1 (acknowledge issuance before the block: claimed issuance an
//      account still holds outside the season vester is netted out of its amount and the total is recorded),
//      ALLOW_UNSAFE_SNAPSHOT=1 (skip ordering preconditions, smoke only)

const MULTICHAIN_BALANCE = ethers.utils.keccak256(
  ethers.utils.defaultAbiCoder.encode(["string"], ["MULTICHAIN_BALANCE"])
);

function multichainBalanceKey(account: string, token: string) {
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(["bytes32", "address", "address"], [MULTICHAIN_BALANCE, account, token])
  );
}

async function main() {
  const provider = getProvider();
  await assertArbitrum(provider);
  const stateProvider = process.env.SNAPSHOT_STATE_RPC
    ? new ethers.providers.JsonRpcProvider(process.env.SNAPSHOT_STATE_RPC)
    : provider;
  await assertArbitrum(stateProvider);
  const networkName = process.env.NETWORK_NAME || "arbitrum";
  const legacy = await getRouterAddresses(provider, REWARD_ROUTER_V2.arbitrum);
  const dataStore = getDeployment(networkName, "DataStore")?.address;
  const multichainVault = getDeployment(networkName, "MultichainVault")?.address;
  if (!dataStore || !multichainVault) {
    throw new Error("missing DataStore or MultichainVault deployment artifact");
  }
  const issuer = getDeployment(networkName, "EsGmxIssuer")?.address;
  const seasonVester = getDeployment(networkName, "SeasonRatioVester")?.address;
  const issuanceAcknowledged = process.env.ISSUANCE_BEFORE_SNAPSHOT === "1";

  const latest = await provider.getBlockNumber();
  const pinned = !!process.env.SNAPSHOT_BLOCK;
  const block = pinned ? parseInt(process.env.SNAPSHOT_BLOCK) : latest;
  if (!pinned) {
    console.log("warning: SNAPSHOT_BLOCK not set, using latest; the real snapshot must use one fixed block");
  }
  const fromBlock = process.env.FROM_BLOCK ? parseInt(process.env.FROM_BLOCK) : 0;
  const chunk = process.env.CHUNK ? parseInt(process.env.CHUNK) : 500_000;

  // the snapshot must land after the switch, when V2 holds no permissions, and before the first issuance
  const orderingReads: [string, string, unknown[]][] = [
    [legacy.esGmx, "isHandler(address) view returns (bool)", [legacy.router]],
    [legacy.stakedGmxTracker, "isHandler(address) view returns (bool)", [legacy.router]],
  ];
  if (issuer) {
    orderingReads.push([issuer, "totalIssuedAmount() view returns (uint256)", []]);
  }
  const ordering = await multiRead(stateProvider, orderingReads, block);
  const orderingViolations: string[] = [];
  if (ordering[0] !== false || ordering[1] !== false) {
    orderingViolations.push(
      `V2 still permissioned at block ${block} (esGmx handler ${ordering[0]}, stakedGmxTracker handler ${ordering[1]})`
    );
  }
  const totalIssuedAtBlock: ethers.BigNumber = issuer && ordering[2] ? ordering[2] : ethers.BigNumber.from(0);
  const netIssuance = issuanceAcknowledged && !!seasonVester && !totalIssuedAtBlock.isZero();
  if (!totalIssuedAtBlock.isZero()) {
    if (netIssuance) {
      console.log(
        `issuance before the snapshot acknowledged: totalIssuedAmount ${totalIssuedAtBlock} at block ${block}; claimed issuance held outside the season vester is netted out per account`
      );
    } else {
      orderingViolations.push(
        `issuance already started at block ${block} (totalIssuedAmount ${totalIssuedAtBlock}); set ISSUANCE_BEFORE_SNAPSHOT=1 to net it out`
      );
    }
  }
  if (orderingViolations.length) {
    if (process.env.ALLOW_UNSAFE_SNAPSHOT === "1") {
      console.log(`warning (ALLOW_UNSAFE_SNAPSHOT): ${orderingViolations.join("; ")}`);
    } else {
      throw new Error(orderingViolations.join("; "));
    }
  }

  const referralVester = await getReferralVester(provider, legacy.esGmx);
  const candidates = new Set<string>();
  for (const [token, label] of [
    [legacy.esGmx, "esGMX transfers"],
    [legacy.stakedGmxTracker, "stakedGmxTracker receipts"],
    [legacy.stakedGlpTracker, "stakedGlpTracker receipts"],
    [legacy.gmxVester, "gmxVester tokens"],
    [legacy.glpVester, "glpVester tokens"],
    [referralVester, "referral vester tokens"],
  ] as [string, string][]) {
    const found = await collectTransferCounterparties(provider, token, fromBlock, block, chunk, label);
    for (const account of found) {
      candidates.add(account);
    }
  }
  // system contracts and the new incentive contracts (the issuer is funded before the
  // snapshot) hold esGMX that must not become caps; the largest entries print below
  const distributors = await multiReadStrict(
    provider,
    [
      legacy.stakedGmxTracker,
      legacy.bonusGmxTracker,
      legacy.extendedGmxTracker,
      legacy.feeGmxTracker,
      legacy.stakedGlpTracker,
      legacy.feeGlpTracker,
    ].map((tracker) => [tracker, "distributor() view returns (address)", []] as [string, string, unknown[]])
  );
  const incentiveDeployments = ["EsGmxIssuer", "SeasonRatioVester", "OrphanRatioVester", "RewardRouterV3"]
    .map((name) => getDeployment(networkName, name)?.address)
    .filter(Boolean) as string[];
  const excluded = [
    legacy.stakedGmxTracker,
    legacy.stakedGlpTracker,
    legacy.gmxVester,
    legacy.glpVester,
    referralVester,
    legacy.router,
    multichainVault,
    ...(distributors.filter(Boolean) as string[]),
    ...incentiveDeployments,
  ];
  for (const address of excluded) {
    candidates.delete(address);
  }
  const merged = readOutFile<any>("multichain-balances.json");
  if (merged) {
    for (const e of merged.accounts) {
      candidates.add(ethers.utils.getAddress(e.account));
    }
  }
  const accounts = [...candidates];
  console.log(`${accounts.length} candidate accounts; reading components at block ${block}`);

  const COMPONENTS_PER_ACCOUNT = 17;
  const components: [string, string, unknown[]][] = [];
  for (const account of accounts) {
    components.push([legacy.esGmx, "balanceOf(address) view returns (uint256)", [account]]);
    components.push([
      legacy.stakedGmxTracker,
      "depositBalances(address,address) view returns (uint256)",
      [account, legacy.esGmx],
    ]);
    components.push([legacy.stakedGmxTracker, "claimable(address) view returns (uint256)", [account]]);
    components.push([legacy.stakedGlpTracker, "claimable(address) view returns (uint256)", [account]]);
    for (const vester of [legacy.gmxVester, legacy.glpVester, referralVester]) {
      components.push([vester, "balanceOf(address) view returns (uint256)", [account]]);
      components.push([vester, "claimable(address) view returns (uint256)", [account]]);
      components.push([vester, "cumulativeClaimAmounts(address) view returns (uint256)", [account]]);
      components.push([vester, "claimedAmounts(address) view returns (uint256)", [account]]);
    }
    components.push([
      dataStore,
      "getUint(bytes32) view returns (uint256)",
      [multichainBalanceKey(account, legacy.esGmx)],
    ]);
  }
  // a failed read must abort the run, never write a zero component into a permanent cap
  const values = await multiReadStrict(stateProvider, components, block);

  const zero = ethers.BigNumber.from(0);
  // issued esGMX an account has claimed and still holds outside the season vester is not legacy esGMX;
  // what it deposited is in the vester's custody or already converted, neither of which the components see
  const issuedOutside = new Map<string, ethers.BigNumber>();
  if (netIssuance) {
    const claimed = await multiReadStrict(
      stateProvider,
      accounts.map(
        (account) =>
          [issuer, "claimedAmounts(address) view returns (uint256)", [account]] as [string, string, unknown[]]
      ),
      block
    );
    const holders = accounts.filter((_, i) => !claimed[i].isZero());
    const claimedOf = new Map(accounts.map((account, i) => [account, claimed[i]]));
    const inVester = holders.length
      ? await multiReadStrict(
          stateProvider,
          holders.flatMap((account) => [
            [seasonVester, "balanceOf(address) view returns (uint256)", [account]] as [string, string, unknown[]],
            [seasonVester, "totalConvertedAmounts(address) view returns (uint256)", [account]] as [
              string,
              string,
              unknown[]
            ],
          ]),
          block
        )
      : [];
    holders.forEach((account, i) => {
      const outside = claimedOf
        .get(account)
        .sub(inVester[2 * i])
        .sub(inVester[2 * i + 1]);
      if (outside.gt(0)) {
        issuedOutside.set(account, outside);
      }
    });
    console.log(
      `${holders.length} accounts claimed issuance before the block; ${issuedOutside.size} hold some of it outside the season vester`
    );
  }
  // vester balances still include the already-time-vested portion until the next
  // interaction materializes it; that portion pays out as GMX, not esGMX
  const netVesting = (
    balance: ethers.BigNumber,
    claimable: ethers.BigNumber,
    cumulative: ethers.BigNumber,
    claimed: ethers.BigNumber
  ) => {
    let nextClaimable = claimable.sub(cumulative.sub(claimed));
    if (nextClaimable.lt(0)) {
      nextClaimable = zero;
    }
    if (nextClaimable.gt(balance)) {
      nextClaimable = balance;
    }
    return balance.sub(nextClaimable);
  };

  const entries: any[] = [];
  let total = zero;
  let walletAttributed = zero;
  let stakedAttributed = zero;
  let gmxVesterAttributed = zero;
  let glpVesterAttributed = zero;
  let referralVesterAttributed = zero;
  let multichainAttributed = zero;
  let issuedNettedTotal = zero;
  for (let i = 0; i < accounts.length; i++) {
    const v = values.slice(i * COMPONENTS_PER_ACCOUNT, (i + 1) * COMPONENTS_PER_ACCOUNT);
    const [
      wallet,
      staked,
      claimableGmxSide,
      claimableGlpSide,
      gmxVBal,
      gmxVClaimable,
      gmxVCum,
      gmxVClaimed,
      glpVBal,
      glpVClaimable,
      glpVCum,
      glpVClaimed,
      refVBal,
      refVClaimable,
      refVCum,
      refVClaimed,
      multichain,
    ] = v;
    const vestingGmx = netVesting(gmxVBal, gmxVClaimable, gmxVCum, gmxVClaimed);
    const vestingGlp = netVesting(glpVBal, glpVClaimable, glpVCum, glpVClaimed);
    const vestingReferral = netVesting(refVBal, refVClaimable, refVCum, refVClaimed);
    const claimable = claimableGmxSide.add(claimableGlpSide);
    const issuedNetted = issuedOutside.get(accounts[i]) || zero;
    issuedNettedTotal = issuedNettedTotal.add(issuedNetted);
    let amount = wallet.add(staked).add(claimable).add(multichain).sub(issuedNetted);
    if (amount.lt(0)) {
      amount = zero;
    }
    if (amount.isZero()) {
      continue;
    }
    total = total.add(amount);
    walletAttributed = walletAttributed.add(wallet);
    stakedAttributed = stakedAttributed.add(staked);
    gmxVesterAttributed = gmxVesterAttributed.add(gmxVBal);
    glpVesterAttributed = glpVesterAttributed.add(glpVBal);
    referralVesterAttributed = referralVesterAttributed.add(refVBal);
    multichainAttributed = multichainAttributed.add(multichain);
    entries.push({
      account: accounts[i],
      wallet: wallet.toString(),
      staked: staked.toString(),
      claimable: claimable.toString(),
      vestingGmx: vestingGmx.toString(),
      vestingGlp: vestingGlp.toString(),
      vestingReferral: vestingReferral.toString(),
      multichain: multichain.toString(),
      issuedNetted: issuedNetted.toString(),
      amount: amount.toString(),
    });
  }

  // totalSupply minus system custody minus attributed wallets = accounts the scan missed
  const reconReads: [string, string, unknown[]][] = [
    [legacy.esGmx, "totalSupply() view returns (uint256)", []],
    [legacy.esGmx, "balanceOf(address) view returns (uint256)", [multichainVault]],
    [legacy.esGmx, "balanceOf(address) view returns (uint256)", [legacy.stakedGmxTracker]],
    [legacy.esGmx, "balanceOf(address) view returns (uint256)", [legacy.gmxVester]],
    [legacy.esGmx, "balanceOf(address) view returns (uint256)", [legacy.glpVester]],
    [legacy.esGmx, "balanceOf(address) view returns (uint256)", [referralVester]],
    ...excluded.map(
      (address) => [legacy.esGmx, "balanceOf(address) view returns (uint256)", [address]] as [string, string, unknown[]]
    ),
  ];
  const recon = await multiReadStrict(stateProvider, reconReads, block);
  const totalSupply = recon[0];
  const vaultBalance = recon[1];
  const systemSum = recon.slice(6).reduce((acc, b) => acc.add(b), zero);
  const unaccountedWallet = totalSupply.sub(systemSum).sub(walletAttributed);
  const unattributed = vaultBalance.sub(multichainAttributed);

  const result = {
    generatedAt: new Date().toISOString(),
    block,
    scan: { fromBlock, chunk, pinned },
    issuance: {
      totalIssuedAtBlock: totalIssuedAtBlock.toString(),
      acknowledged: netIssuance,
      nettedAccounts: issuedOutside.size,
      nettedAmount: issuedNettedTotal.toString(),
    },
    accounts: entries,
    total: total.toString(),
    reconciliation: {
      totalSupply: totalSupply.toString(),
      systemContracts: systemSum.toString(),
      walletAttributed: walletAttributed.toString(),
      unaccountedWallet: unaccountedWallet.toString(),
      stakedAttributed: stakedAttributed.toString(),
      stakedCustody: recon[2].toString(),
      gmxVesterAttributed: gmxVesterAttributed.toString(),
      gmxVesterCustody: recon[3].toString(),
      glpVesterAttributed: glpVesterAttributed.toString(),
      glpVesterCustody: recon[4].toString(),
      referralVesterAttributed: referralVesterAttributed.toString(),
      referralVesterCustody: recon[5].toString(),
    },
    multichainVault: {
      vaultEsGmxBalance: vaultBalance.toString(),
      attributed: multichainAttributed.toString(),
      unattributed: unattributed.toString(),
    },
  };
  const outFile = writeOutFile("orphan-snapshot.json", result);

  console.log(`${entries.length} accounts with un-vested legacy esGMX, total ${total}`);
  const largest = [...entries].sort((a, b) => (ethers.BigNumber.from(a.amount).lt(b.amount) ? 1 : -1)).slice(0, 10);
  console.log("largest entries (review for system contracts before loading caps):");
  for (const e of largest) {
    console.log(`  ${e.account}: ${e.amount}`);
  }
  console.log(
    `wallet reconciliation: totalSupply ${totalSupply}, system ${systemSum}, attributed ${walletAttributed}, unaccounted ${unaccountedWallet}`
  );
  console.log(
    `staked: attributed ${stakedAttributed} vs custody ${recon[2]}; gmxVester ${gmxVesterAttributed} vs ${recon[3]}; glpVester ${glpVesterAttributed} vs ${recon[4]}; referralVester ${referralVesterAttributed} vs ${recon[5]}`
  );
  console.log(
    `multichain vault: balance ${vaultBalance}, attributed ${multichainAttributed}, unattributed ${unattributed}`
  );
  if (netIssuance) {
    console.log(
      `issuance netted: ${issuedNettedTotal} across ${issuedOutside.size} accounts (totalIssuedAmount ${totalIssuedAtBlock} at the block)`
    );
  }
  if (!unaccountedWallet.isZero() || !unattributed.isZero()) {
    console.log(
      "nonzero unaccounted balance present: investigate before loading caps (missing accounts become permanently zero caps once provisioningComplete is set)"
    );
  }
  console.log(`written to ${outFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
