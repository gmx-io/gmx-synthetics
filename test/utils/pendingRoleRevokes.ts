import { expect } from "chai";
import hre from "hardhat";
import { constants, utils } from "ethers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { deployFixture } from "../../utils/fixture";
import { hashString } from "../../utils/hash";
import {
  buildRoleGrantCancellationBatches,
  discoverPairedRoleGrants,
  inspectRoleGrantCleanup,
  RoleGrantCleanupParams,
} from "../../utils/roleGrantCleanup";

describe("Informational pending role revokes", () => {
  let timelock, controller, roleStore, admin, cleanupAccount, account, otherAccount, wallet;
  let params: RoleGrantCleanupParams;
  const role = hashString("CONTROLLER");
  const zero = constants.HashZero;
  const salt = utils.id("grant round");

  const payload = (kind: string, member: string, roleKey = role) =>
    roleStore.interface.encodeFunctionData(kind, [member, roleKey]);
  const operationId = (kind: string, member: string, roundSalt = salt, roleKey = role) =>
    controller.hashOperation(roleStore.address, 0, payload(kind, member, roleKey), zero, roundSalt);
  const inspect = () => inspectRoleGrantCleanup(hre.ethers.provider, params, admin.address);

  async function signalPair(member: string, roundSalt = salt, roleKey = role) {
    return (
      await timelock
        .connect(admin)
        .multicall(
          ["signalRevokeRole", "signalGrantRole"].map((kind) =>
            timelock.interface.encodeFunctionData(kind, [member, roleKey, zero, roundSalt])
          )
        )
    ).wait();
  }

  async function execute(kind: string, member: string, roundSalt = salt, roleKey = role) {
    await time.increase(86401);
    return (
      await timelock.connect(admin).execute(roleStore.address, payload(kind, member, roleKey), zero, roundSalt)
    ).wait();
  }

  beforeEach(async () => {
    const fixture = await deployFixture();
    ({ timelockConfig: timelock, configTimelockController: controller, roleStore } = fixture.contracts);
    ({ user0: admin, user1: cleanupAccount, user2: account, user3: otherAccount, wallet } = fixture.accounts);
    await roleStore.grantRole(admin.address, hashString("TIMELOCK_ADMIN"));
    params = {
      chainId: (await hre.ethers.provider.getNetwork()).chainId,
      timelockConfig: timelock.address,
      timelockController: controller.address,
      roleStore: roleStore.address,
    };
    // A completed original grant cleanup keeps informational reporting separate from scope validation.
    const cleanupSalt = utils.id("completed cleanup");
    await signalPair(cleanupAccount.address, cleanupSalt);
    await execute("revokeRole", cleanupAccount.address, cleanupSalt);
    await timelock.connect(admin).cancelAction(await operationId("grantRole", cleanupAccount.address, cleanupSalt));
  });

  it("reports original pending revokes without changing grant batches or cleanup completion", async () => {
    const signal = await signalPair(account.address);
    const execution = await execute("grantRole", account.address);
    const pendingId = await operationId("revokeRole", account.address);
    await signalPair(otherAccount.address);
    await execute("revokeRole", otherAccount.address);

    const report = await inspect();
    expect(report.errors).deep.eq([]);
    expect(report.warnings).deep.eq([]);
    expect(report.pendingRevokes.length).eq(1);
    expect(report.pendingRevokes[0]).to.include({
      id: pendingId,
      grantId: await operationId("grantRole", account.address),
      account: account.address,
      role,
      roleName: "CONTROLLER",
      signalTxHash: signal.transactionHash,
      grantExecutionTxHash: execution.transactionHash,
      state: "ready",
    });
    expect(report.complete).eq(false);
    const [batch] = buildRoleGrantCancellationBatches(report);
    expect(batch.map((tx) => tx.contractInputsValues.id)).deep.eq([
      await operationId("grantRole", otherAccount.address),
    ]);
    await timelock.connect(admin).multicall(batch.map((tx) => tx.data));
    const completed = await inspect();
    expect(completed.complete).eq(true);
    expect(completed.pendingRevokes.map((revoke) => revoke.id)).deep.eq([pendingId]);
    expect(buildRoleGrantCancellationBatches(completed)).deep.eq([]);
  });

  it("excludes unexecuted grants, standalone revokes and grants paired in a different transaction", async () => {
    await signalPair(otherAccount.address);
    await timelock.connect(admin).signalRevokeRole(account.address, role, zero, salt);
    await timelock.connect(admin).signalGrantRole(account.address, role, zero, salt);
    await execute("grantRole", account.address);
    const report = await inspect();
    expect(report.pendingRevokes).deep.eq([]);
    expect(report.warnings.some((warning) => warning.includes("scheduled separately"))).eq(true);
    expect(report.errors).deep.eq([]);
    expect(report.complete).eq(true);
  });

  it("does not confuse fresh requests for the same account with an executed grant's counterpart", async () => {
    await signalPair(account.address);
    await execute("grantRole", account.address);
    await signalPair(account.address, utils.id("fresh salt"));
    const report = await inspect();
    expect(report.pendingRevokes.map((revoke) => revoke.id)).deep.eq([
      await operationId("revokeRole", account.address),
    ]);
    expect(report.warnings).deep.eq([]);
    expect(report.complete).eq(true);
  });

  it("excludes rescheduled revoke IDs with a warning instead of blocking grant cleanup", async () => {
    await signalPair(account.address);
    await execute("grantRole", account.address);
    const id = await operationId("revokeRole", account.address);
    await timelock.connect(admin).cancelAction(id);
    await timelock.connect(admin).signalRevokeRole(account.address, role, zero, salt);
    const report = await inspect();
    expect(report.pendingRevokes).deep.eq([]);
    expect(report.warnings.some((warning) => warning.includes(id) && warning.includes("rescheduled"))).eq(true);
    expect(report.errors).deep.eq([]);
    expect(report.complete).eq(true);
    expect(buildRoleGrantCancellationBatches(report)).deep.eq([]);
  });

  for (const action of ["cancel", "execute"]) {
    it(`excludes a revoke after it is ${action === "cancel" ? "cancelled" : "executed"}`, async () => {
      await signalPair(account.address);
      await execute("grantRole", account.address);
      if (action === "cancel") {
        await timelock.connect(admin).cancelAction(await operationId("revokeRole", account.address));
      } else {
        await execute("revokeRole", account.address);
      }
      const report = await inspect();
      expect(report.pendingRevokes).deep.eq([]);
      expect(report.errors).deep.eq([]);
      expect(report.complete).eq(true);
    });
  }

  it("retains unknown role hashes and handles zero-salt pending revokes", async () => {
    const unknown = hashString("HISTORICAL_CUSTOM_ROLE");
    await signalPair(account.address, zero, unknown);
    await execute("grantRole", account.address, zero, unknown);
    const report = await inspect();
    expect(report.pendingRevokes.length).eq(1);
    expect(report.pendingRevokes[0]).to.include({ role: unknown, roleName: null, salt: zero });
    expect(report.complete).eq(true);
  });

  it("does not declare the grant cleanup complete when only pending revoke counterparts exist", async () => {
    const signal = await signalPair(account.address);
    const execution = await execute("grantRole", account.address);
    const selectedHashes = new Set([signal.transactionHash, execution.transactionHash]);
    const provider = new Proxy(hre.ethers.provider, {
      get(target, property) {
        if (property === "getLogs") {
          return async (filter) =>
            (await target.getLogs(filter)).filter((log) => selectedHashes.has(log.transactionHash));
        }
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const report = await inspectRoleGrantCleanup(provider, params, admin.address);
    expect(report.grants).deep.eq([]);
    expect(report.pendingRevokes.length).eq(1);
    expect(report.complete).eq(false);
    expect(report.errors).deep.eq(["No paired grants found for executed revokes"]);
  });

  for (const batchKind of ["grantRole", "revokeRole"]) {
    it(`warns about a batched ${batchKind} without treating it as an original single-call counterpart`, async () => {
      const multicall = await (await hre.ethers.getContractFactory("Multicall3")).deploy();
      const standalone = await (
        await hre.ethers.getContractFactory("TimelockController")
      ).deploy(86400, [multicall.address], [wallet.address], wallet.address);
      await roleStore.grantRole(standalone.address, hashString("ROLE_ADMIN"));
      const signal = await (
        await multicall.aggregate(
          ["grantRole", "revokeRole"].map((kind) => ({
            target: standalone.address,
            callData:
              kind === batchKind
                ? standalone.interface.encodeFunctionData("scheduleBatch", [
                    [roleStore.address],
                    [0],
                    [payload(kind, account.address)],
                    zero,
                    salt,
                    86400,
                  ])
                : standalone.interface.encodeFunctionData("schedule", [
                    roleStore.address,
                    0,
                    payload(kind, account.address),
                    zero,
                    salt,
                    86400,
                  ]),
          }))
        )
      ).wait();
      await time.increase(86401);
      const execution = await (batchKind === "grantRole"
        ? await standalone.executeBatch([roleStore.address], [0], [payload("grantRole", account.address)], zero, salt)
        : await standalone.execute(roleStore.address, 0, payload("grantRole", account.address), zero, salt)
      ).wait();
      const discovered = discoverPairedRoleGrants([signal, execution], {
        ...params,
        timelockController: standalone.address,
      });
      expect(discovered.revokeCandidates).deep.eq([]);
      expect(discovered.warnings.some((warning) => warning.includes("batch"))).eq(true);
      expect(discovered.grants).deep.eq([]);
    });
  }
});
