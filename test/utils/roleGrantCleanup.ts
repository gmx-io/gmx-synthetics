import fs from "fs";
import os from "os";
import path from "path";
import { expect } from "chai";
import hre from "hardhat";
import { constants, providers, utils } from "ethers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { deployFixture } from "../../utils/fixture";
import { hashString } from "../../utils/hash";
import { PROTOCOL_MULTISIG } from "../../utils/constants";
import {
  buildRoleGrantCancellationBatches,
  discoverPairedRoleGrants,
  findRoleHistoryTransactions,
  findControllerDeploymentBlock,
  inspectRoleGrantCleanup,
  RoleGrantCleanupParams,
} from "../../utils/roleGrantCleanup";
import { main as updateRoles } from "../../scripts/updateRoles";
import * as timelockUtils from "../../utils/timelock";
import * as timelockConfigUtils from "../../utils/timelockConfig";
import * as validationUtils from "../../scripts/validateDeploymentUtils";
import * as rolesToAdd from "../../scripts/roles/rolesToAdd";
import * as rolesToRemove from "../../scripts/roles/rolesToRemove";

async function expectFailure(promise: Promise<unknown>, message: string) {
  try {
    await promise;
  } catch (error) {
    expect(error.message).to.include(message);
    return;
  }
  expect.fail(`Expected failure containing: ${message}`);
}

describe("Paired role grant cleanup", () => {
  let timelock, controller, roleStore, admin, account, otherAccount, wallet;
  const role = hashString("CONTROLLER");
  const salt = utils.id("2.2b revoke round");
  const zero = constants.HashZero;
  let base: RoleGrantCleanupParams;

  beforeEach(async () => {
    const fixture = await deployFixture();
    ({ timelockConfig: timelock, configTimelockController: controller, roleStore } = fixture.contracts);
    ({ user0: admin, user2: account, user3: otherAccount, wallet } = fixture.accounts);
    await roleStore.grantRole(admin.address, hashString("TIMELOCK_ADMIN"));
    base = {
      chainId: (await hre.ethers.provider.getNetwork()).chainId,
      timelockConfig: timelock.address,
      timelockController: controller.address,
      roleStore: roleStore.address,
    };
  });

  const payload = (kind: string, member: string) => roleStore.interface.encodeFunctionData(kind, [member, role]);
  async function pairedSignal(member = account.address, roundSalt = salt, predecessor = zero) {
    await roleStore.grantRole(member, role);
    return (
      await timelock
        .connect(admin)
        .multicall([
          timelock.interface.encodeFunctionData("signalRevokeRole", [member, role, predecessor, roundSalt]),
          timelock.interface.encodeFunctionData("signalGrantRole", [member, role, predecessor, roundSalt]),
        ])
    ).wait();
  }
  async function revoke(member = account.address, roundSalt = salt, predecessor = zero) {
    await time.increase(86401);
    return (
      await timelock.connect(admin).execute(roleStore.address, payload("revokeRole", member), predecessor, roundSalt)
    ).wait();
  }
  function inspect(input: RoleGrantCleanupParams = base, safe = admin.address) {
    return inspectRoleGrantCleanup(hre.ethers.provider, input, safe);
  }

  async function signalWithUpdateRoles(method: "signalGrantRole" | "signalRevokeRole", roundSalt = salt) {
    // Run the actual script with fixture role lists and a local-only transaction writer.
    // Its paired-signal construction and Safe JSON generation are exercised unchanged.
    const originalWriter = timelockUtils.timelockWriteMulticall;
    const originalGetTimelock = timelockConfigUtils.getTimelockConfig;
    const originalValidator = validationUtils.validateSourceCode;
    const network = hre.network.name;
    const originalAdd = Object.getOwnPropertyDescriptor(rolesToAdd, network);
    const originalRemove = Object.getOwnPropertyDescriptor(rolesToRemove, network);
    const envKeys = ["TIMELOCK_METHOD", "SALT", "SAFE_TX_BATCH_SIZE"];
    const savedEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
    const originalCwd = process.cwd();
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "paired-role-signals-test-"));
    let receipt: providers.TransactionReceipt;
    try {
      const selected = { member: account.address, role: "CONTROLLER", contractName: "LocalFixture" };
      const other = { ...selected, member: otherAccount.address };
      Object.assign(rolesToAdd, { [network]: [method === "signalGrantRole" ? selected : other] });
      Object.assign(rolesToRemove, { [network]: [method === "signalRevokeRole" ? selected : other] });
      Object.assign(timelockConfigUtils, { getTimelockConfig: async () => timelock });
      Object.assign(validationUtils, {
        validateSourceCode: async (_, info) => {
          info.isCodeValidated = true;
        },
      });
      Object.assign(timelockUtils, {
        timelockWriteMulticall: async ({ multicallWriteParams }) => {
          receipt = await (await timelock.connect(admin).multicall(multicallWriteParams)).wait();
        },
      });
      process.chdir(temp);
      process.env.TIMELOCK_METHOD = method;
      process.env.SALT = roundSalt;
      process.env.SAFE_TX_BATCH_SIZE = "50";
      await updateRoles();
      const [output] = fs.readdirSync("out");
      expect(output).to.match(new RegExp(`^updateRoles-${method}-${network}-\\d{4}-\\d{2}-\\d{2}T`));
      const [filename] = fs.readdirSync(path.join("out", output));
      const batch = JSON.parse(fs.readFileSync(path.join("out", output, filename), "utf8"));
      expect(batch.meta.createdFromSafeAddress).eq(PROTOCOL_MULTISIG);
      expect(batch.transactions.map((tx) => tx.contractMethod.name)).deep.eq(["signalRevokeRole", "signalGrantRole"]);
      return receipt;
    } finally {
      Object.assign(timelockUtils, { timelockWriteMulticall: originalWriter });
      Object.assign(timelockConfigUtils, { getTimelockConfig: originalGetTimelock });
      Object.assign(validationUtils, { validateSourceCode: originalValidator });
      for (const [module, descriptor] of [
        [rolesToAdd, originalAdd],
        [rolesToRemove, originalRemove],
      ]) {
        if (descriptor) Object.defineProperty(module, network, descriptor);
        else delete module[network];
      }
      process.chdir(originalCwd);
      for (const key of envKeys) {
        if (savedEnv[key] === undefined) delete process.env[key];
        else process.env[key] = savedEnv[key];
      }
      fs.rmSync(temp, { recursive: true, force: true });
    }
  }

  it("discovers executed revokes, cancels only their paired grants, and requires a fresh request and delay", async () => {
    await roleStore.grantRole(account.address, role);
    const signal = await signalWithUpdateRoles("signalRevokeRole");
    await pairedSignal(otherAccount.address);
    const execution = await revoke();
    const report = await inspect();
    expect(report.errors).deep.eq([]);
    expect(report.grants.length).eq(1);
    expect(report.grants[0].signalTxHash).eq(signal.transactionHash);
    expect(report.grants[0].revokeExecutionTxHash).eq(execution.transactionHash);
    expect(report.grants[0].state).eq("ready");
    const nonce = await admin.getTransactionCount();
    const [batch] = buildRoleGrantCancellationBatches(report);
    expect(await admin.getTransactionCount()).eq(nonce);
    expect(batch.length).eq(1);
    expect(batch[0].to).eq(timelock.address);
    expect(timelock.interface.parseTransaction({ data: batch[0].data }).args.id).eq(report.grants[0].id);
    // All sends in this file target only the local Hardhat fixture.
    await admin.sendTransaction({ to: batch[0].to, data: batch[0].data });
    const unrelatedId = await controller.hashOperation(
      roleStore.address,
      0,
      payload("grantRole", otherAccount.address),
      zero,
      salt
    );
    expect(await controller.isOperationPending(unrelatedId)).eq(true);
    expect(await controller.isOperationDone(report.grants[0].revokeId)).eq(true);
    await expect(
      timelock.connect(admin).execute(roleStore.address, payload("grantRole", account.address), zero, salt)
    ).to.be.revertedWith("TimelockController: operation is not ready");
    expect((await inspect()).complete).eq(true);
    expect(buildRoleGrantCancellationBatches(await inspect())).deep.eq([]);

    const newSalt = utils.id("fresh request");
    await signalWithUpdateRoles("signalGrantRole", newSalt);
    const afterNewSignal = await inspect();
    expect(afterNewSignal.grants.length).eq(1); // The new pair's revoke has not executed.
    expect(afterNewSignal.complete).eq(true);
    await expect(
      timelock.connect(admin).execute(roleStore.address, payload("grantRole", account.address), zero, newSalt)
    ).to.be.revertedWith("TimelockController: operation is not ready");
    await time.increase(86401);
    await timelock.connect(admin).execute(roleStore.address, payload("grantRole", account.address), zero, newSalt);
    expect(await roleStore.hasRole(account.address, role)).eq(true);
    const restored = await inspect();
    expect(restored.grants[0].state).eq("cancelled");
    expect(restored.grants[0].rolePresent).eq(true);
    expect(restored.complete).eq(true);
    // Legitimate restoration must not block cleanup of a different, newly executed revoke.
    await revoke(otherAccount.address);
    const laterCleanup = await inspect();
    expect(laterCleanup.errors).deep.eq([]);
    const laterBatch = buildRoleGrantCancellationBatches(laterCleanup)[0];
    expect(laterBatch.map((tx) => timelock.interface.parseTransaction({ data: tx.data }).args.id)).deep.eq([
      unrelatedId,
    ]);
  });

  it("flags a paired grant executed after its revoke, even if the role was revoked again", async () => {
    await pairedSignal();
    await revoke();
    await timelock.connect(admin).execute(roleStore.address, payload("grantRole", account.address), zero, salt);
    await roleStore.revokeRole(account.address, role);
    const report = await inspect();
    expect(report.grants[0].state).eq("executed");
    expect(report.complete).eq(false);
    expect(() => buildRoleGrantCancellationBatches(report)).to.throw("already executed after its revoke");
  });

  it("reports grants used before their paired revokes as completed history, not cancellations", async () => {
    await pairedSignal();
    await time.increase(86401);
    await timelock.connect(admin).execute(roleStore.address, payload("grantRole", account.address), zero, salt);
    await revoke();
    const report = await inspect();
    expect(report.grants[0].state).eq("executedBeforeRevoke");
    expect(report.grants[0].timestamp).eq("1");
    expect(report.complete).eq(true);
    expect(buildRoleGrantCancellationBatches(report)).deep.eq([]);
  });

  it("refuses a new grant reusing an original operation ID", async () => {
    await pairedSignal();
    await revoke();
    const original = (await inspect()).grants[0];
    await timelock.connect(admin).cancelAction(original.id);
    await timelock.connect(admin).signalGrantRole(account.address, role, zero, salt);
    const report = await inspect();
    expect(report.grants[0].hasLaterGrantSchedule).eq(true);
    expect(report.grants[0].state).eq("rescheduled");
    expect(() => buildRoleGrantCancellationBatches(report)).to.throw("was rescheduled");
  });

  it("follows the latest revoke schedule before execution when an earlier pair was cancelled", async () => {
    await pairedSignal();
    for (const kind of ["grantRole", "revokeRole"]) {
      const id = await controller.hashOperation(roleStore.address, 0, payload(kind, account.address), zero, salt);
      await timelock.connect(admin).cancelAction(id);
    }
    const newSignal = await pairedSignal();
    await revoke();
    const report = await inspect();
    expect(report.errors).deep.eq([]);
    expect(report.grants.length).eq(1);
    expect(report.grants[0].signalTxHash).eq(newSignal.transactionHash);
    expect(report.grants[0].state).eq("ready");
  });

  it("does not pair a standalone revoke with a grant from a different signal transaction", async () => {
    await timelock.connect(admin).signalRevokeRole(account.address, role, zero, salt);
    await timelock.connect(admin).signalGrantRole(account.address, role, zero, salt);
    await revoke();
    await expectFailure(inspect(), "pairing ambiguous");
  });

  it("reports standalone revokes with no matching grant without adding them to cancellation batches", async () => {
    await pairedSignal();
    await revoke();
    await timelock.connect(admin).signalRevokeRole(otherAccount.address, role, zero, salt);
    await revoke(otherAccount.address);
    const report = await inspect();
    expect(report.errors).deep.eq([]);
    expect(report.grants.length).eq(1);
    expect(report.unpairedRevokes.length).eq(1);
    expect(report.unpairedRevokes[0].account).eq(otherAccount.address);
    expect(buildRoleGrantCancellationBatches(report)[0].length).eq(1);
  });

  it("fails rather than overlooking a grant left behind by a separately re-signalled revoke", async () => {
    await pairedSignal();
    const revokeId = await controller.hashOperation(
      roleStore.address,
      0,
      payload("revokeRole", account.address),
      zero,
      salt
    );
    await timelock.connect(admin).cancelAction(revokeId);
    await timelock.connect(admin).signalRevokeRole(account.address, role, zero, salt);
    await revoke();
    await expectFailure(inspect(), "pairing ambiguous");
  });

  for (const method of ["signalGrantRole", "signalRevokeRole"] as const) {
    it(`${method} preserves both signals for the selected role list`, async () => {
      const receipt = await signalWithUpdateRoles(method);
      const scheduled = receipt.logs.filter(
        (log) =>
          log.address === controller.address && log.topics[0] === controller.interface.getEventTopic("CallScheduled")
      );
      expect(scheduled.map((log) => controller.interface.parseLog(log).args.data)).deep.eq([
        payload("revokeRole", account.address),
        payload("grantRole", account.address),
      ]);
      for (const kind of ["revokeRole", "grantRole"]) {
        const id = await controller.hashOperation(roleStore.address, 0, payload(kind, account.address), zero, salt);
        expect(await controller.isOperationPending(id)).eq(true);
      }
    });
  }

  it("matches nonzero predecessors and excludes another pair for the same account and salt", async () => {
    const parentSalt = utils.id("predecessor");
    await timelock.connect(admin).signalGrantRole(otherAccount.address, role, zero, parentSalt);
    const predecessor = await controller.hashOperation(
      roleStore.address,
      0,
      payload("grantRole", otherAccount.address),
      zero,
      parentSalt
    );
    await time.increase(86401);
    await timelock
      .connect(admin)
      .execute(roleStore.address, payload("grantRole", otherAccount.address), zero, parentSalt);
    await pairedSignal(account.address, salt, predecessor);
    await pairedSignal(account.address, salt, zero);
    await revoke(account.address, salt, predecessor);
    const report = await inspect();
    expect(report.errors).deep.eq([]);
    expect(report.grants.length).eq(1);
    expect(report.grants[0].predecessor).eq(predecessor);
  });

  it("rejects a grant hidden inside a batch alongside an individual revoke", async () => {
    const multicall = await (await hre.ethers.getContractFactory("Multicall3")).deploy();
    const standalone = await (
      await hre.ethers.getContractFactory("TimelockController")
    ).deploy(86400, [multicall.address], [wallet.address], wallet.address);
    await roleStore.grantRole(standalone.address, hashString("ROLE_ADMIN"));
    const grantData = payload("grantRole", account.address);
    const revokeData = payload("revokeRole", account.address);
    const signal = await (
      await multicall.aggregate([
        {
          target: standalone.address,
          callData: standalone.interface.encodeFunctionData("schedule", [
            roleStore.address,
            0,
            revokeData,
            zero,
            salt,
            86400,
          ]),
        },
        {
          target: standalone.address,
          callData: standalone.interface.encodeFunctionData("scheduleBatch", [
            [roleStore.address],
            [0],
            [grantData],
            zero,
            salt,
            86400,
          ]),
        },
      ])
    ).wait();
    await time.increase(86401);
    const execution = await (await standalone.execute(roleStore.address, 0, revokeData, zero, salt)).wait();
    expect(() =>
      discoverPairedRoleGrants([signal, execution], { ...base, timelockController: standalone.address })
    ).to.throw("Batched paired grant");
  });

  it("handles zero salt, multiple executions, partial cleanup and batch splitting", async () => {
    await pairedSignal(account.address, zero);
    await pairedSignal(otherAccount.address, salt);
    await revoke(account.address, zero);
    await revoke(otherAccount.address, salt);
    const report = await inspect();
    expect(report.errors).deep.eq([]);
    const batches = buildRoleGrantCancellationBatches(report, 1);
    expect(batches.map((batch) => batch.length)).deep.eq([1, 1]);
    await admin.sendTransaction({ to: batches[0][0].to, data: batches[0][0].data });
    const after = await inspect();
    expect(after.complete).eq(false);
    expect(after.grants.map((grant) => grant.state)).deep.eq(["cancelled", "ready"]);
    expect(buildRoleGrantCancellationBatches(after)[0][0].data).eq(batches[1][0].data);
    for (const size of [0, -1, 1.5, NaN])
      expect(() => buildRoleGrantCancellationBatches(after, size)).to.throw("Invalid SAFE_TX_BATCH_SIZE");
  });

  it("excludes unexecuted revokes and blocks cleanup if a revoked role is restored", async () => {
    await pairedSignal();
    const before = await inspect();
    expect(before.grants).deep.eq([]);
    expect(() => buildRoleGrantCancellationBatches(before)).to.throw("No paired grants found");
    await revoke();
    await roleStore.grantRole(account.address, role);
    expect(() => buildRoleGrantCancellationBatches(before)).to.throw("No paired grants found");
    const after = await inspect();
    expect(() => buildRoleGrantCancellationBatches(after)).to.throw("Revoked role is present");
  });

  it("checks Safe and wrapper authorization plus controller/RoleStore linkage", async () => {
    await pairedSignal();
    await revoke();
    const unauthorized = await inspect(base, otherAccount.address);
    expect(() => buildRoleGrantCancellationBatches(unauthorized)).to.throw("lacks TIMELOCK_ADMIN");
    await expectFailure(
      inspect({ ...base, timelockController: roleStore.address }),
      "TimelockConfig/controller mismatch"
    );
    await expectFailure(inspect({ ...base, roleStore: controller.address }), "TimelockConfig/RoleStore mismatch");
    await expectFailure(inspect({ ...base, chainId: base.chainId + 1 }), "chainId does not match RPC");
    await roleStore.revokeRole(timelock.address, hashString("ROLE_ADMIN"));
    expect((await inspect()).errors).deep.eq([]); // Cancellation does not need ROLE_ADMIN.
    const deniedProvider = new Proxy(hre.ethers.provider, {
      get(target, property) {
        if (property === "call")
          return async (tx, blockTag) => {
            expect(blockTag).to.be.a("number");
            if (
              (await tx.to).toLowerCase() === controller.address.toLowerCase() &&
              (await tx.data).startsWith(controller.interface.getSighash("hasRole"))
            ) {
              return utils.defaultAbiCoder.encode(["bool"], [false]);
            }
            return target.call(tx, blockTag);
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const missingPermission = await inspectRoleGrantCleanup(deniedProvider, base, admin.address);
    expect(() => buildRoleGrantCancellationBatches(missingPermission)).to.throw("lacks CANCELLER_ROLE");
  });

  it("rejects missing schedules, failed/duplicate receipts and wrong emitters", async () => {
    const signal = await pairedSignal();
    const execution = await revoke();
    expect(() => discoverPairedRoleGrants([execution], base)).to.throw("Missing schedule for executed revoke");
    expect(() => discoverPairedRoleGrants([{ ...signal, status: 0 }, execution], base)).to.throw(
      "Role history transaction failed"
    );
    expect(() => discoverPairedRoleGrants([signal, signal, execution], base)).to.throw(
      "Duplicate role history receipt"
    );
    expect(
      discoverPairedRoleGrants([signal, execution], { ...base, timelockController: account.address }).grants
    ).deep.eq([]);
    const readProvider = new Proxy(hre.ethers.provider, {
      get(target, property) {
        if (property === "getTransactionReceipt") return async () => null;
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await expectFailure(
      inspectRoleGrantCleanup(readProvider, base, admin.address),
      "Missing or unconfirmed role history receipt"
    );
  });

  it("rejects mixed and single-call batched revokes", async () => {
    for (const datas of [
      [payload("revokeRole", account.address), payload("grantRole", otherAccount.address)],
      [payload("revokeRole", account.address)],
    ]) {
      const targets = datas.map(() => roleStore.address);
      const values = datas.map(() => 0);
      const roundSalt = utils.id(`batch-${datas.length}`);
      await controller.connect(wallet).scheduleBatch(targets, values, datas, zero, roundSalt, 86400);
      await time.increase(86401);
      await controller.connect(wallet).executeBatch(targets, values, datas, zero, roundSalt);
      await expectFailure(inspect(), datas.length > 1 ? "Batched revoke operation" : "revoke encoding or batch");
      // Restore the fixture before the next case so the prior batch does not mask it.
      if (datas.length > 1) {
        const fixture = await deployFixture();
        ({ timelockConfig: timelock, configTimelockController: controller, roleStore } = fixture.contracts);
      }
    }
  });

  it("verifies the deployment receipt and avoids archive-code reads when it is available", async () => {
    const deployment = await hre.deployments.get("ConfigTimelockController");
    const deploymentHash = deployment.transactionHash || deployment.receipt.transactionHash;
    const snapshot = await hre.ethers.provider.getBlockNumber();
    const provider = new Proxy(hre.ethers.provider, {
      get(target, property) {
        if (property === "getCode")
          return async () => {
            throw new Error("Historical state unavailable");
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const fromBlock = await findControllerDeploymentBlock(provider, controller.address, snapshot, deploymentHash);
    expect(fromBlock).eq((await hre.ethers.provider.getTransactionReceipt(deploymentHash)).blockNumber);
    await expectFailure(
      findControllerDeploymentBlock(provider, roleStore.address, snapshot, deploymentHash),
      "Invalid controller deployment receipt"
    );
    await expectFailure(
      findControllerDeploymentBlock(provider, controller.address, snapshot, utils.id("missing deployment")),
      "Invalid controller deployment receipt"
    );
    await expectFailure(
      findControllerDeploymentBlock(provider, controller.address, fromBlock - 1, deploymentHash),
      "Invalid controller deployment receipt"
    );
  });

  it("locates controller creation and handles RPC range limits without skipping failed ranges", async () => {
    const signal = await pairedSignal();
    const execution = await revoke();
    const deployment = await findControllerDeploymentBlock(
      hre.ethers.provider,
      controller.address,
      execution.blockNumber
    );
    expect(await hre.ethers.provider.getCode(controller.address, deployment - 1)).eq("0x");
    expect(await hre.ethers.provider.getCode(controller.address, deployment)).not.eq("0x");
    let rangeRetries = 0;
    const limitedProvider = new Proxy(hre.ethers.provider, {
      get(target, property) {
        if (property === "getLogs")
          return async (filter) => {
            if (filter.toBlock > filter.fromBlock) {
              rangeRetries++;
              throw new Error("block range limited to 1");
            }
            return target.getLogs(filter);
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const hashes = await findRoleHistoryTransactions(limitedProvider, base, signal.blockNumber, execution.blockNumber);
    expect(hashes).deep.eq([signal.transactionHash, execution.transactionHash]);
    expect(rangeRetries).greaterThan(0);
    const failedProvider = new Proxy(hre.ethers.provider, {
      get(target, property) {
        if (property === "getLogs")
          return async () => {
            throw new Error("RPC unavailable");
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await expectFailure(
      findRoleHistoryTransactions(failedProvider, base, signal.blockNumber, execution.blockNumber),
      "discovery incomplete"
    );
    await expectFailure(
      findRoleHistoryTransactions(hre.ethers.provider, base, execution.blockNumber + 1, execution.blockNumber),
      "Invalid role history block range"
    );
    await expectFailure(
      findControllerDeploymentBlock(hre.ethers.provider, account.address, execution.blockNumber),
      "Controller has no code"
    );
  });

  it("uses one command before, during and after cleanup without signing, even with WRITE=true", async () => {
    await roleStore.grantRole(PROTOCOL_MULTISIG, hashString("TIMELOCK_ADMIN"));
    const members: string[] = [];
    for (let index = 0; index < 52; index++) {
      const member = utils.getAddress(utils.hexDataSlice(utils.id(`member-${index}`), 12));
      members.push(member);
      await pairedSignal(member, utils.id(`round-${index}`));
    }
    await pairedSignal(otherAccount.address, utils.id("unexecuted revoke"));
    await time.increase(86401);
    for (let index = 0; index < members.length; index++) {
      await timelock
        .connect(admin)
        .execute(roleStore.address, payload("revokeRole", members[index]), zero, utils.id(`round-${index}`));
    }
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "role-grant-cleanup-test-"));
    const envKeys = ["TIMELOCK_METHOD", "WRITE", "SAFE_TX_BATCH_SIZE", "TIMELOCK_CONFIG"];
    const savedEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
    const originalCwd = process.cwd();
    const originalGetDeployment = hre.deployments.get;
    const readOnlyProvider = new Proxy(hre.ethers.provider, {
      get(target, property) {
        if (["getSigner", "sendTransaction", "send", "perform"].includes(String(property)))
          throw new Error(`Forbidden provider method: ${String(property)}`);
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    try {
      process.chdir(temp);
      delete process.env.TIMELOCK_CONFIG;
      process.env.TIMELOCK_METHOD = "cancelGrantRole";
      process.env.WRITE = "true";
      process.env.SAFE_TX_BATCH_SIZE = "50";
      Object.assign(hre.deployments, {
        get: async (name) => {
          expect(name).eq("TimelockConfig");
          return { address: timelock.address };
        },
      });
      const runCleanup = async () => {
        const previous = fs.existsSync("out") ? fs.readdirSync("out") : [];
        await updateRoles(readOnlyProvider);
        const outputs = fs.readdirSync("out").filter((name) => !previous.includes(name));
        expect(outputs.length).eq(1);
        const [output] = outputs;
        expect(output).to.match(/^updateRoles-cancelGrantRole-hardhat-\d{4}-\d{2}-\d{2}T/);
        const report = JSON.parse(fs.readFileSync(path.join("out", output, "report.json"), "utf8"));
        const files = fs.readdirSync(path.join("out", output));
        const batches = files
          .filter((name) => name.startsWith("safe-batch-"))
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
          .map((name) => JSON.parse(fs.readFileSync(path.join("out", output, name), "utf8")));
        return { report, batches, files };
      };
      const initial = await runCleanup();
      expect(initial.report.complete).eq(false);
      expect(initial.report.grants.length).eq(52);
      expect(initial.report.params.chainId).eq(base.chainId);
      expect(initial.report.params.timelockConfig).eq(timelock.address);
      expect(initial.report.grants.every((grant) => members.includes(grant.account))).eq(true);
      expect(initial.report.grants.every((grant) => grant.role === role && grant.roleName === "CONTROLLER")).eq(true);
      expect(fs.readdirSync(temp)).deep.eq(["out"]);
      expect(initial.batches.map((batch) => batch.transactions.length)).deep.eq([50, 2]);
      for (const batch of initial.batches) {
        expect(batch.chainId).eq(String(base.chainId));
        expect(batch.meta.createdFromSafeAddress).eq(PROTOCOL_MULTISIG);
        expect(batch.meta.description).to.include(
          `Snapshot block ${initial.report.blockNumber} (${initial.report.blockHash})`
        );
        expect(batch.transactions.every((tx) => tx.to === timelock.address && tx.value === "0")).eq(true);
      }
      const repeated = await runCleanup();
      expect(repeated.report.complete).eq(false);
      expect(repeated.batches.map((batch) => batch.transactions)).deep.eq(
        initial.batches.map((batch) => batch.transactions)
      );

      await timelock.connect(admin).multicall(initial.batches[0].transactions.map((tx) => tx.data));
      const partial = await runCleanup();
      expect(partial.report.complete).eq(false);
      expect(partial.report.grants.filter((grant) => grant.state === "cancelled").length).eq(50);
      expect(partial.batches.length).eq(1);
      expect(partial.batches[0].transactions).deep.eq(initial.batches[1].transactions);
      await timelock.connect(admin).multicall(partial.batches[0].transactions.map((tx) => tx.data));

      process.env.TIMELOCK_CONFIG = timelock.address;
      Object.assign(hre.deployments, {
        get: async () => {
          throw new Error("Explicit wrapper bypasses deployment lookup");
        },
      });
      for (let run = 0; run < 2; run++) {
        const completed = await runCleanup();
        expect(completed.report.complete).eq(true);
        expect(completed.batches).deep.eq([]);
        expect(completed.files).deep.eq(["report.json"]);
      }
    } finally {
      Object.assign(hre.deployments, { get: originalGetDeployment });
      process.chdir(originalCwd);
      for (const key of envKeys) {
        if (savedEnv[key] === undefined) delete process.env[key];
        else process.env[key] = savedEnv[key];
      }
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });
});
