import hre from "hardhat";
import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import { deployContract } from "../../utils/deploy";
import { hashString, keccakString } from "../../utils/hash";

import { TIMELOCK_ADMIN_ROLE, PROPOSER_ROLE, EXECUTOR_ROLE, CANCELLER_ROLE, Support, State } from "../../utils/gov";

describe("ProtocolGovernor", () => {
  const { provider } = ethers;
  let roleStore, govToken, governor, timelock;
  let wallet, user0, user1, user2, user3, user4, user5;

  beforeEach(async () => {
    const accountList = await hre.ethers.getSigners();
    [wallet, user0, user1, user2, user3, user4, user5] = accountList;

    roleStore = await deployContract("RoleStore", []);
    govToken = await deployContract("GovToken", [roleStore.address, "GovToken", "GT", 18]);
    timelock = await deployContract("GovTimelockController", [
      "GovTimelockController", //name
      5 * 24 * 60 * 60, // minDelay
      [], // proposers
      [], // executors
      user0.address, // admin
    ]);

    governor = await deployContract("ProtocolGovernor", [
      govToken.address, // token
      timelock.address, // timelock
      "Governor", // name
      "v1", // version
      24 * 60 * 60, // votingDelay
      6 * 24 * 60 * 60, // votingPeriod
      50_000, // proposalThreshold
      4, // quorumNumeratorValue
    ]);

    await roleStore.connect(wallet).grantRole(wallet.address, hashString("GOV_TOKEN_CONTROLLER"));

    await timelock.connect(user0).grantRole(PROPOSER_ROLE, governor.address);
    await timelock.connect(user0).grantRole(CANCELLER_ROLE, governor.address);
    await timelock.connect(user0).grantRole(EXECUTOR_ROLE, governor.address);

    await timelock.connect(user0).revokeRole(TIMELOCK_ADMIN_ROLE, user0.address);
  });

  it("initializes", async () => {
    expect(await governor.token()).eq(govToken.address);
    expect(await governor.timelock()).eq(timelock.address);
    expect(await governor.name()).eq("Governor");
    expect(await governor.version()).eq("v1");
    expect(await governor.votingDelay()).eq(24 * 60 * 60);
    expect(await governor.votingPeriod()).eq(6 * 24 * 60 * 60);
    expect(await governor.proposalThreshold()).eq(50_000);
    expect(await governor.callStatic["quorumNumerator()"]()).eq(4);
  });

  it("uses timestamp for clock", async () => {
    const block = await provider.getBlock();
    expect(await governor.clock()).eq(block.timestamp);
    expect(await governor.CLOCK_MODE()).eq("mode=timestamp");
  });

  it("propose, vote, execute", async () => {
    await expect(
      governor.connect(user1).functions["propose(address[],uint256[],bytes[],string)"](
        [governor.address], // targets
        [0], // values
        [governor.interface.encodeFunctionData("updateTimelock", [user3.address])], // calldatas
        "update timelock" // description
      )
    ).to.be.revertedWith("Governor: proposer votes below proposal threshold");

    await govToken.connect(wallet).mint(user1.address, 49_000);

    await expect(
      governor.connect(user1).functions["propose(address[],uint256[],bytes[],string)"](
        [governor.address], // targets
        [0], // values
        [governor.interface.encodeFunctionData("updateTimelock", [user3.address])], // calldatas
        "update timelock" // description
      )
    ).to.be.revertedWith("Governor: proposer votes below proposal threshold");

    await govToken.connect(wallet).mint(user1.address, 1000);
    await govToken.connect(user1).delegate(user1.address);

    await governor.connect(user1).functions["propose(address[],uint256[],bytes[],string)"](
      [governor.address], // targets
      [0], // values
      [governor.interface.encodeFunctionData("updateTimelock", [user3.address])], // calldatas
      "update timelock" // description
    );

    const proposalId = await governor.hashProposal(
      [governor.address], // targets
      [0], // values
      [governor.interface.encodeFunctionData("updateTimelock", [user3.address])], // calldatas
      keccakString("update timelock") // description
    );

    await govToken.connect(wallet).mint(user2.address, 50_000);
    await govToken.connect(user2).delegate(user2.address);

    await govToken.connect(wallet).mint(user3.address, 100_000);
    await govToken.connect(user3).delegate(user3.address);

    await govToken.connect(wallet).mint(user4.address, 400_000);
    await govToken.connect(user4).delegate(user4.address);

    await govToken.connect(wallet).mint(user5.address, 400_000);
    await govToken.connect(user5).delegate(user5.address);

    await expect(governor.connect(user1).castVote(proposalId, Support.For)).to.be.revertedWith(
      "Governor: vote not currently active"
    );

    await time.increase(24 * 60 * 60);

    await governor.connect(user1).castVote(proposalId, Support.For);
    await governor.connect(user2).castVote(proposalId, Support.For);
    await governor.connect(user3).castVote(proposalId, Support.For);

    expect(await governor.state(proposalId)).eq(State.Active);

    expect(await governor.quorumVotes()).eq(40_000); // totalSupply: 1,000,000, quorum: 4%,

    await time.increase(6 * 24 * 60 * 60);

    expect(await governor.state(proposalId)).eq(State.Succeeded);

    await expect(
      governor.connect(user2).functions["execute(address[],uint256[],bytes[],bytes32)"](
        [governor.address], // targets
        [0], // values
        [governor.interface.encodeFunctionData("updateTimelock", [user3.address])], // calldatas
        keccakString("update timelock") // description
      )
    ).to.be.revertedWith("TimelockController: operation is not ready");

    await governor.connect(user2).functions["queue(address[],uint256[],bytes[],bytes32)"](
      [governor.address], // targets
      [0], // values
      [governor.interface.encodeFunctionData("updateTimelock", [user3.address])], // calldatas
      keccakString("update timelock") // description
    );

    await time.increase(2 * 24 * 60 * 60);

    await expect(
      governor.connect(user2).functions["execute(address[],uint256[],bytes[],bytes32)"](
        [governor.address], // targets
        [0], // values
        [governor.interface.encodeFunctionData("updateTimelock", [user3.address])], // calldatas
        keccakString("update timelock") // description
      )
    ).to.be.revertedWith("TimelockController: operation is not ready");

    await time.increase(3 * 24 * 60 * 60);

    expect(await governor.timelock()).eq(timelock.address);

    await governor.connect(user2).functions["execute(address[],uint256[],bytes[],bytes32)"](
      [governor.address], // targets
      [0], // values
      [governor.interface.encodeFunctionData("updateTimelock", [user3.address])], // calldatas
      keccakString("update timelock") // description
    );

    expect(await governor.timelock()).eq(user3.address);
  });
});
