import hre from "hardhat";
import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import { deployContract } from "../../utils/deploy";
import { TIMELOCK_ADMIN_ROLE, PROPOSER_ROLE, EXECUTOR_ROLE, CANCELLER_ROLE } from "../../utils/gov";

describe("GovTimelockController", () => {
  let timelock;
  let wallet, user0, user1, user2, user3;
  const { HashZero } = ethers.constants;

  beforeEach(async () => {
    const accountList = await hre.ethers.getSigners();
    [wallet, user0, user1, user2, user3] = accountList;

    timelock = await deployContract("GovTimelockController", [
      "GovTimelockController", //name
      5 * 24 * 60 * 60, // minDelay
      [user1.address], // proposers
      [user2.address], // executors
      user0.address, // admin
    ]);
  });

  it("initializes", async () => {
    expect(await timelock.name()).eq("GovTimelockController");
    expect(await timelock.getMinDelay()).eq(5 * 24 * 60 * 60);

    expect(await timelock.hasRole(TIMELOCK_ADMIN_ROLE, timelock.address)).eq(true);
    expect(await timelock.hasRole(TIMELOCK_ADMIN_ROLE, wallet.address)).eq(false);
    expect(await timelock.hasRole(TIMELOCK_ADMIN_ROLE, user0.address)).eq(true);

    expect(await timelock.hasRole(PROPOSER_ROLE, wallet.address)).eq(false);
    expect(await timelock.hasRole(PROPOSER_ROLE, user0.address)).eq(false);
    expect(await timelock.hasRole(PROPOSER_ROLE, user1.address)).eq(true);

    expect(await timelock.hasRole(CANCELLER_ROLE, wallet.address)).eq(false);
    expect(await timelock.hasRole(CANCELLER_ROLE, user0.address)).eq(false);
    expect(await timelock.hasRole(CANCELLER_ROLE, user1.address)).eq(true);

    expect(await timelock.hasRole(EXECUTOR_ROLE, wallet.address)).eq(false);
    expect(await timelock.hasRole(EXECUTOR_ROLE, user0.address)).eq(false);
    expect(await timelock.hasRole(EXECUTOR_ROLE, user1.address)).eq(false);
    expect(await timelock.hasRole(EXECUTOR_ROLE, user2.address)).eq(true);
  });

  it("schedule", async () => {
    await expect(
      timelock.connect(user0).schedule(
        timelock.address, // target
        0, // value
        timelock.interface.encodeFunctionData("grantRole", [PROPOSER_ROLE, user3.address]), // data
        HashZero, // predecessor
        "0x0000000000000000000000000000000000000000000000000000000000000001", // salt
        5 * 24 * 60 * 60 // delay
      )
    ).to.be.revertedWith(`AccessControl: account ${user0.address.toLowerCase()} is missing role ${PROPOSER_ROLE}`);

    await timelock.connect(user1).schedule(
      timelock.address, // target
      0, // value
      timelock.interface.encodeFunctionData("grantRole", [PROPOSER_ROLE, user3.address]), // data
      HashZero, // predecessor
      "0x0000000000000000000000000000000000000000000000000000000000000001", // salt
      5 * 24 * 60 * 60 // delay
    );
  });

  it("execute", async () => {
    await timelock.connect(user1).schedule(
      timelock.address, // target
      0, // value
      timelock.interface.encodeFunctionData("grantRole", [PROPOSER_ROLE, user3.address]), // data
      HashZero, // predecessor
      "0x0000000000000000000000000000000000000000000000000000000000000001", // salt
      5 * 24 * 60 * 60 // delay
    );

    await expect(
      timelock.connect(user1).execute(
        timelock.address, // target
        0, // value
        timelock.interface.encodeFunctionData("grantRole", [PROPOSER_ROLE, user3.address]), // data
        HashZero, // predecessor
        "0x0000000000000000000000000000000000000000000000000000000000000001" // salt
      )
    ).to.be.revertedWith(`AccessControl: account ${user1.address.toLowerCase()} is missing role ${EXECUTOR_ROLE}`);

    await expect(
      timelock.connect(user2).execute(
        timelock.address, // target
        0, // value
        timelock.interface.encodeFunctionData("grantRole", [PROPOSER_ROLE, user3.address]), // data
        HashZero, // predecessor
        "0x0000000000000000000000000000000000000000000000000000000000000001" // salt
      )
    ).to.be.revertedWith("TimelockController: operation is not ready");

    await time.increase(5 * 24 * 60 * 60 - 100);

    await expect(
      timelock.connect(user2).execute(
        timelock.address, // target
        0, // value
        timelock.interface.encodeFunctionData("grantRole", [PROPOSER_ROLE, user3.address]), // data
        HashZero, // predecessor
        "0x0000000000000000000000000000000000000000000000000000000000000001" // salt
      )
    ).to.be.revertedWith("TimelockController: operation is not ready");

    await time.increase(200);

    expect(await timelock.hasRole(PROPOSER_ROLE, user3.address)).eq(false);

    await timelock.connect(user2).execute(
      timelock.address, // target
      0, // value
      timelock.interface.encodeFunctionData("grantRole", [PROPOSER_ROLE, user3.address]), // data
      HashZero, // predecessor
      "0x0000000000000000000000000000000000000000000000000000000000000001" // salt
    );

    expect(await timelock.hasRole(PROPOSER_ROLE, user3.address)).eq(true);
  });

  it("updatedDelay", async () => {
    await timelock.connect(user1).schedule(
      timelock.address, // target
      0, // value
      timelock.interface.encodeFunctionData("updateDelay", [3 * 24 * 60 * 60]), // data
      HashZero, // predecessor
      "0x0000000000000000000000000000000000000000000000000000000000000001", // salt
      5 * 24 * 60 * 60 // delay
    );

    await time.increase(5 * 24 * 60 * 60 + 100);

    expect(await timelock.getMinDelay()).eq(5 * 24 * 60 * 60);

    await timelock.connect(user2).execute(
      timelock.address, // target
      0, // value
      timelock.interface.encodeFunctionData("updateDelay", [3 * 24 * 60 * 60]), // data
      HashZero, // predecessor
      "0x0000000000000000000000000000000000000000000000000000000000000001" // salt
    );

    expect(await timelock.getMinDelay()).eq(3 * 24 * 60 * 60);
  });
});
