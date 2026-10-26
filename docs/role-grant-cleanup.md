# Cancel grants paired with executed revokes

`updateRoles.ts` schedules both a grant and a revoke for each role change so the
change can be rolled back. Paired scheduling remains unchanged. Executing a revoke
does not cancel its paired grant: after the delay, that grant remains executable
by authorized executors until it is cancelled or executed.

This cleanup discovers those pairs from controller events, prepares reviewable
`TimelockConfig.cancelAction(id)` batches for the protocol multisig, and verifies
cleanup afterwards. It requires no account/role inventory, fixed grant count,
release-specific contract addresses, signal transaction hashes, or input file.

## How discovery works

1. Select the network's deployed `TimelockConfig`, or the existing
   `TIMELOCK_CONFIG` override when inspecting an older timelock. Read its controller
   and RoleStore addresses at a fixed snapshot block.
2. Locate the controller's creation block from the matching deployment transaction
   record, verifying its successful receipt, created address and canonical block.
   If that record is unavailable (for example, for an older wrapper), locate the
   non-upgradeable controller through historical code reads instead. Scan its `CallScheduled` and `CallExecuted` events through the snapshot,
   and fetch the canonical receipts containing role calls to that RoleStore.
3. Select executed `revokeRole` operations. For each operation ID, find its latest
   scheduling event before execution. `CallExecuted` does not contain the salt or
   predecessor; these come from the original `CallScheduled` and `CallSalt` events
   (zero salt is implicit when no `CallSalt` was emitted).
4. Find the grant scheduled **in the same signal transaction**, with the same
   account, role, predecessor and salt. Read its ID from `CallScheduled` and verify
   both operation hashes. Matching account/role alone is insufficient: it could
   select a separate, fresh grant request.
5. Check both operations' current state and the role at the same snapshot. Only
   original pending grants whose revokes executed and whose roles are absent are
   included in cancellation batches.

The scope is all such pairs on the selected controller, including the historical
v2.2b revokes. It is no longer tied to a hardcoded release inventory. A replacement
controller has separate history; select the old wrapper with `TIMELOCK_CONFIG`
when that is the history to clean. The report identifies the controller and scan
range so its scope is reviewable.

Standalone revokes with no matching scheduled grant are listed separately.
A matching grant scheduled in a different transaction is ambiguous and stops
cleanup. Batched revoke operations, or matching grants encoded as batch operations,
are unsupported and stop cleanup: cancelling a batch cannot be limited to one call.
Unexecuted revokes and unrelated grants are not cancellation candidates.

A grant executed **before** its paired revoke is completed history, reported as
`executedBeforeRevoke` and excluded from cancellation. It is not reported as
cancelled. A grant executed **after** its revoke stops cleanup for investigation,
even if another action later removed the role.

Original grants remain discoverable after cancellation, allowing verification to
check the same IDs. If an ID is reused for a later pending grant, later scheduling
events and the original readiness timestamp identify it as `rescheduled`; the tool
stops instead of cancelling that new request. A new pair with a fresh salt and an
unexecuted revoke is excluded from grant-cancellation candidates.

## Generate reviewable Safe batches

After executing the revokes:

```sh
TIMELOCK_METHOD=cancelGrantRole \
  npx hardhat run scripts/updateRoles.ts --network arbitrum
```

Use `--network megaEth` or `--network avalanche` for those networks. Set
`TIMELOCK_CONFIG=0x...` only when the deployed wrapper is not the intended one.
`SALT` is not a cleanup input: salts are recovered from scheduling events.

This mode only reads RPC state and writes files. It never prompts, signs, submits,
or simulates transactions. `WRITE=true` cannot enable execution. Normal role
signalling/execution modes retain their existing behavior. Cleanup is a separate
step after revocation; no contract upgrade is required.

Each run creates `out/updateRoles-cancelGrantRole-<network>-<timestamp>/`
containing:

- `report.json`: contract addresses, snapshot block/hash, scan start, discovered
  history transactions, each grant ID and paired revoke ID, account/role,
  original signal and revoke execution transactions/blocks, original/current
  readiness timestamps, current state, role presence, and standalone executed revokes.
  Role entries include the raw `role` hash and a readable `roleName` (`null` for
  unknown historical roles). `pendingRevokes` lists original pending revoke
  counterparts of executed grants; `warnings` records informational history
  that cannot be safely paired. These revokes never enter cancellation batches
  or affect grant-cleanup completion; they may be intentional rollback options.
- `safe-batch-*.json`: pending grant cancellations addressed to
  `TimelockConfig.cancelAction(id)`, for protocol multisig
  `0x58F582455b54d7c83d03BCeed95FAf72B37fdDD7`.

Other `updateRoles.ts` actions use the same directory convention, with their method
name in place of `cancelGrantRole`. Timestamps use UTC with milliseconds;
simultaneous runs receive a numeric suffix so earlier output is never overwritten.

The default batch size is 50 (`SAFE_TX_BATCH_SIZE` overrides it). Counts come from
events; for example, 52 pending grants produce batches of 50 and 2. Cancelled grants
and grants used before their revoke remain in the report but produce no Safe calls.
Both signalling methods require an even batch size so each grant/revoke pair stays
in one Safe transaction. Execution and cancellation accept any positive integer.
Invalid sizes fail before output generation or transaction preparation.

Generation fails on ambiguous/inconsistent history, a grant executed after its
revoke, a rescheduled pending grant, a restored role while its original grant is
still pending, or missing
Safe/wrapper cancellation permissions. If no pairs are discovered, it fails instead
of reporting a potentially wrong controller or incomplete history as successful
cleanup. Review the addresses, signal/revoke execution transactions and each call.
Re-run generation near any separately authorized multisig execution: state changes
can make a stale batch revert. The tool does not submit batches to Safe.

## Verify after separately authorized execution

```sh
TIMELOCK_METHOD=cancelGrantRole \
  npx hardhat run scripts/updateRoles.ts --network arbitrum
```

Use the same command, wrapper and network as generation. Each run rediscovers
the pairs and writes a fresh report. If grants remain pending, it generates batches
for the remaining grants and sets `complete: false`. After cancellation it sets
`complete: true` and writes no batch files. A successful command exit means the
inspection/output succeeded; check `report.complete` to confirm cleanup.

Completion requires no original paired grants to remain outstanding: cleanup pairs
must have timestamp zero and their revokes executed; grants used before their
revoke are classified separately as completed history. Role presence
remains visible in the report, but an already-cancelled grant does not block a
legitimate restoration through a fresh request. This verifies outstanding grant
operations, not permanent role absence. A grant executed after its revoke is
never mistaken for cancellation.

A future restoration through `updateRoles.ts` uses a fresh `SALT` and a new timelock
delay: the old revoke ID has already executed and cannot be scheduled again.

## RPC requirements and local checks

Discovery needs complete historical event and receipt access. Historical code
access is also required when no matching controller deployment transaction record
is available. It reduces
query ranges on RPC range-limit errors and stops on other failures, rather than
treating them as empty results. Very small range limits can make scanning slow.
Configure a suitable historical RPC using the existing `.rpcs.json` settings.
Like other RPC-based inspection, discovery relies on the provider returning
complete results; there is no hardcoded inventory against which to cross-check it.

The generic `cancelTimelockOps.ts` script is unchanged and separate: it can select
revokes and unrelated operations as well as grants.

Local regression checks (no external network):

```sh
npx hardhat test --network hardhat test/utils/roleGrantCleanup.ts test/utils/safeTx.ts test/utils/roleNames.ts test/utils/pendingRoleRevokes.ts test/utils/roleSignalBatches.ts test/config/Timelock.ts
```
