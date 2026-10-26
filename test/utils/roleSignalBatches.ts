import fs from "fs";
import os from "os";
import path from "path";
import { expect } from "chai";
import { afterEach } from "mocha";
import hre from "hardhat";
import { constants, providers, utils } from "ethers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { main as updateRoles } from "../../scripts/updateRoles";
import * as rolesToAdd from "../../scripts/roles/rolesToAdd";
import * as rolesToRemove from "../../scripts/roles/rolesToRemove";
import * as validationUtils from "../../scripts/validateDeploymentUtils";
import { PROTOCOL_MULTISIG } from "../../utils/constants";
import { deployFixture } from "../../utils/fixture";
import { hashString } from "../../utils/hash";
import { inspectRoleGrantCleanup } from "../../utils/roleGrantCleanup";
import { getSafeTxBatchSize } from "../../utils/safeTx";
import * as timelockUtils from "../../utils/timelock";
import * as timelockConfigUtils from "../../utils/timelockConfig";

async function expectFailure(promise: Promise<unknown>, message: string) {
  try {
    await promise;
  } catch (error) {
    expect(error.message).to.include(message);
    return;
  }
  expect.fail(`Expected failure containing: ${message}`);
}

describe("Role signal Safe batches", () => {
  const modes = [
    "signalGrantRole",
    "signalRevokeRole",
    "grantRoleAfterSignal",
    "revokeRoleAfterSignal",
    "cancelGrantRole",
  ];
  const envKeys = ["TIMELOCK_METHOD", "SAFE_TX_BATCH_SIZE", "SALT", "TIMELOCK_CONFIG", "WRITE"];
  let savedEnv: Record<string, string>;
  let originalCwd: string;
  let temp: string;
  let originals;

  beforeEach(() => {
    savedEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
    originalCwd = process.cwd();
    temp = fs.mkdtempSync(path.join(os.tmpdir(), "role-signal-batches-test-"));
    originals = {
      writer: timelockUtils.timelockWriteMulticall,
      getTimelock: timelockConfigUtils.getTimelockConfig,
      validator: validationUtils.validateSourceCode,
      add: Object.getOwnPropertyDescriptor(rolesToAdd, hre.network.name),
      remove: Object.getOwnPropertyDescriptor(rolesToRemove, hre.network.name),
    };
    Object.assign(timelockConfigUtils, {
      getTimelockConfig: async () => {
        throw new Error("Unexpected timelock lookup");
      },
    });
    Object.assign(timelockUtils, {
      timelockWriteMulticall: async () => {
        throw new Error("Unexpected writer invocation");
      },
    });
    Object.assign(validationUtils, {
      validateSourceCode: async () => {
        throw new Error("Unexpected source validation");
      },
    });
    process.env.WRITE = "true";
    process.chdir(temp);
  });

  afterEach(() => {
    Object.assign(timelockConfigUtils, { getTimelockConfig: originals.getTimelock });
    Object.assign(timelockUtils, { timelockWriteMulticall: originals.writer });
    Object.assign(validationUtils, { validateSourceCode: originals.validator });
    for (const [module, descriptor] of [
      [rolesToAdd, originals.add],
      [rolesToRemove, originals.remove],
    ]) {
      if (descriptor) Object.defineProperty(module, hre.network.name, descriptor);
      else delete module[hre.network.name];
    }
    process.chdir(originalCwd);
    for (const key of envKeys) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
    fs.rmSync(temp, { recursive: true, force: true });
  });

  const forbiddenProvider = new Proxy({} as providers.Provider, {
    get() {
      throw new Error("Unexpected provider access");
    },
  });

  it("rejects invalid sizes in every mode before chain access, signing or output", async () => {
    delete process.env.SAFE_TX_BATCH_SIZE;
    expect(getSafeTxBatchSize()).eq(50);
    for (const size of ["0", "-1", "1.5", "NaN", "Infinity", "9007199254740992", "", " "]) {
      process.env.SAFE_TX_BATCH_SIZE = size;
      for (const mode of modes) {
        process.env.TIMELOCK_METHOD = mode;
        await expectFailure(updateRoles(forbiddenProvider), "Invalid SAFE_TX_BATCH_SIZE");
      }
    }
    expect(fs.readdirSync(".")).deep.eq([]);
  });

  it("rejects odd sizes for both signal modes before chain access, signing or output", async () => {
    for (const size of ["1", "3", "51"]) {
      process.env.SAFE_TX_BATCH_SIZE = size;
      for (const mode of ["signalGrantRole", "signalRevokeRole"]) {
        process.env.TIMELOCK_METHOD = mode;
        await expectFailure(updateRoles(forbiddenProvider), "SAFE_TX_BATCH_SIZE must be even");
      }
    }
    expect(fs.readdirSync(".")).deep.eq([]);
  });

  for (const signalMode of ["signalGrantRole", "signalRevokeRole"]) {
    it(`preserves complete ${signalMode} pairs across generated Safe transactions and later cleanup`, async () => {
      process.chdir(originalCwd);
      delete process.env.WRITE;
      const fixture = await deployFixture();
      process.env.WRITE = "true";
      process.chdir(temp);
      const { timelockConfig: timelock, configTimelockController: controller, roleStore } = fixture.contracts;
      const { user0: admin } = fixture.accounts;
      await roleStore.grantRole(admin.address, hashString("TIMELOCK_ADMIN"));
      await roleStore.grantRole(PROTOCOL_MULTISIG, hashString("TIMELOCK_ADMIN"));
      const members = Array.from({ length: 5 }, (_, index) =>
        utils.getAddress(utils.hexDataSlice(utils.id(`signal batch member ${index}`), 12))
      );
      const role = hashString("CONTROLLER");
      const salt = utils.id(`signal batch ${signalMode}`);
      const roles = members.map((member, index) => ({
        member,
        role: "CONTROLLER",
        contractName: `LocalFixture${index}`,
      }));
      for (const member of members) await roleStore.grantRole(member, role);
      Object.assign(rolesToAdd, { [hre.network.name]: roles });
      Object.assign(rolesToRemove, { [hre.network.name]: roles });
      Object.assign(timelockConfigUtils, { getTimelockConfig: async () => timelock });
      Object.assign(validationUtils, {
        validateSourceCode: async (_, info) => {
          info.isCodeValidated = true;
        },
      });
      const writerCalls: string[][] = [];
      Object.assign(timelockUtils, {
        // The entry point only generates files here. Execute their contents separately on Hardhat below.
        timelockWriteMulticall: async ({ multicallWriteParams }) => {
          writerCalls.push(multicallWriteParams);
        },
      });
      process.env.SALT = salt;
      process.env.TIMELOCK_CONFIG = timelock.address;

      const encodeRow = (row) =>
        timelock.interface.encodeFunctionData(
          row.contractMethod.name,
          row.contractMethod.inputs.map((input) => row.contractInputsValues[input.name])
        );
      async function generate(mode: string, size: number) {
        const previous = fs.existsSync("out") ? fs.readdirSync("out") : [];
        const nonce = await admin.getTransactionCount();
        process.env.TIMELOCK_METHOD = mode;
        process.env.SAFE_TX_BATCH_SIZE = String(size);
        await updateRoles();
        expect(await admin.getTransactionCount()).eq(nonce);
        const newDirs = fs.readdirSync("out").filter((dir) => !previous.includes(dir));
        expect(newDirs.length).eq(1);
        const outputDir = path.join("out", newDirs[0]);
        const batches = fs
          .readdirSync(outputDir)
          .filter((name) => name.startsWith("safe-batch-"))
          .sort()
          .map((name) => JSON.parse(fs.readFileSync(path.join(outputDir, name), "utf8")));
        if (mode !== "cancelGrantRole") {
          expect(batches.flatMap((batch) => batch.transactions.map(encodeRow))).deep.eq(
            writerCalls[writerCalls.length - 1]
          );
        }
        return batches;
      }

      const signalBatches = await generate(signalMode, 4);
      expect(signalBatches.map((batch) => batch.transactions.length)).deep.eq([4, 4, 2]);
      const signalReceiptByAccount = new Map<string, string>();
      for (const batch of signalBatches) {
        for (let index = 0; index < batch.transactions.length; index += 2) {
          const revoke = batch.transactions[index];
          const grant = batch.transactions[index + 1];
          expect(revoke.contractMethod.name).eq("signalRevokeRole");
          expect(grant.contractMethod.name).eq("signalGrantRole");
          expect(grant.contractInputsValues).deep.eq(revoke.contractInputsValues);
          expect(grant.contractInputsValues.roleKey).eq(role);
          expect(grant.contractInputsValues.predecessor).eq(constants.HashZero);
          expect(grant.contractInputsValues.salt).eq(salt);
        }
        const receipt = await (await timelock.connect(admin).multicall(batch.transactions.map(encodeRow))).wait();
        const scheduled = receipt.logs
          .filter(
            (log) =>
              log.address.toLowerCase() === controller.address.toLowerCase() &&
              log.topics[0] === controller.interface.getEventTopic("CallScheduled")
          )
          .map((log) => controller.interface.parseLog(log).args);
        expect(scheduled.length).eq(batch.transactions.length);
        for (let index = 0; index < batch.transactions.length; index += 2) {
          const member = batch.transactions[index].contractInputsValues.account;
          expect(scheduled[index].data).eq(roleStore.interface.encodeFunctionData("revokeRole", [member, role]));
          expect(scheduled[index + 1].data).eq(roleStore.interface.encodeFunctionData("grantRole", [member, role]));
          signalReceiptByAccount.set(member, receipt.transactionHash);
        }
      }
      expect(signalReceiptByAccount.size).eq(5);

      // Odd sizes remain valid for independent execution rows in both execution modes.
      const grantBatches = await generate("grantRoleAfterSignal", 3);
      expect(grantBatches.map((batch) => batch.transactions.length)).deep.eq([3, 2]);
      for (const row of grantBatches.flatMap((batch) => batch.transactions)) {
        const execution = timelock.interface.parseTransaction({ data: encodeRow(row) });
        const grantedRole = roleStore.interface.parseTransaction({ data: execution.args.payload });
        expect(grantedRole.name).eq("grantRole");
        expect(members).to.include(grantedRole.args.account);
      }
      await time.increase(86401);
      const revokeBatches = await generate("revokeRoleAfterSignal", 3);
      expect(revokeBatches.map((batch) => batch.transactions.length)).deep.eq([3, 2]);
      for (const batch of revokeBatches) {
        await (await timelock.connect(admin).multicall(batch.transactions.map(encodeRow))).wait();
      }
      const report = await inspectRoleGrantCleanup(
        hre.ethers.provider,
        {
          chainId: (await hre.ethers.provider.getNetwork()).chainId,
          timelockConfig: timelock.address,
          timelockController: controller.address,
          roleStore: roleStore.address,
        },
        PROTOCOL_MULTISIG
      );
      expect(report.errors).deep.eq([]);
      expect(report.grants.length).eq(5);
      expect(report.unpairedRevokes).deep.eq([]);
      for (const grant of report.grants) {
        expect(grant.state).eq("ready");
        expect(grant.signalTxHash).eq(signalReceiptByAccount.get(grant.account));
        expect(grant.predecessor).eq(constants.HashZero);
        expect(grant.salt).eq(salt);
      }

      const cancellationBatches = await generate("cancelGrantRole", 3);
      expect(cancellationBatches.map((batch) => batch.transactions.length)).deep.eq([3, 2]);
      expect(
        cancellationBatches.flatMap((batch) =>
          batch.transactions.map((row) => timelock.interface.parseTransaction({ data: row.data }).args.id)
        )
      ).deep.eq(report.grants.map((grant) => grant.id));
      expect(writerCalls.length).eq(3); // Cleanup must never invoke the transaction writer.
    });
  }
});
