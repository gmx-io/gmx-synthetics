import hre from "hardhat";
import { expect } from "chai";
import { time, mine } from "@nomicfoundation/hardhat-network-helpers";

import { deployContract } from "../../utils/deploy";
import { hashString, keccakString } from "../../utils/hash";

import { TIMELOCK_ADMIN_ROLE, PROPOSER_ROLE, EXECUTOR_ROLE, CANCELLER_ROLE, Support, State } from "../../utils/gov";
import { errorsContract } from "../../utils/error";

describe("ProtocolGovernor", () => {
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

  it("Guardian: User cannot transfer votes and vote again on the same proposal", async () => {
    await govToken.connect(wallet).mint(user1.address, 49_000);

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

    await govToken.connect(wallet).mint(user4.address, 100_000);
    await govToken.connect(user4).delegate(user4.address);

    await time.increase(24 * 60 * 60);

    // 150_000 votes For
    await governor.connect(user2).castVote(proposalId, Support.For);
    await governor.connect(user3).castVote(proposalId, Support.For);

    // 100_000 votes Against
    await governor.connect(user4).castVote(proposalId, Support.Against);

    await expect(govToken.connect(user4).transfer(user5.address, 100_000))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user4.address, "GOV_TOKEN_CONTROLLER");

    await govToken.connect(user4).approve(user4.address, 100_000);

    await expect(govToken.connect(user4).transferFrom(user4.address, user5.address, 100_000))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user4.address, "GOV_TOKEN_CONTROLLER");

    await govToken.connect(user4).approve(wallet.address, 100_000);

    expect(await govToken.balanceOf(user5.address)).eq(0);

    await govToken.connect(wallet).transferFrom(user4.address, user5.address, 100_000);

    expect(await govToken.balanceOf(user5.address)).eq(100_000);
    await govToken.connect(user5).delegate(user5.address);

    // User 5 tried to use the newly send votes to vote Against
    await governor.connect(user5).castVote(proposalId, Support.Against);

    expect(await govToken.balanceOf(user5.address)).eq(100_000);

    expect(await governor.state(proposalId)).eq(State.Active);

    await time.increase(6 * 24 * 60 * 60);

    // User5's votes did not impact the proposal
    expect(await governor.state(proposalId)).eq(State.Succeeded);
  });

  it("Guardian: Proposal cannot be voted on and executed in the same block", async () => {
    await govToken.connect(wallet).mint(user1.address, 49_000);

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

    await govToken.connect(wallet).mint(user4.address, 200_000);
    await govToken.connect(user4).delegate(user4.address);

    await time.increase(24 * 60 * 60);

    // 150_000 votes For
    await governor.connect(user2).castVote(proposalId, Support.For);
    await governor.connect(user3).castVote(proposalId, Support.For);

    expect(await governor.state(proposalId)).eq(State.Active);

    await time.increase(6 * 24 * 60 * 60);

    // State is now Succeeded
    expect(await governor.state(proposalId)).eq(State.Succeeded);

    // User4 tried to use 200_000 votes Against before the proposal is executed
    await expect(governor.connect(user4).castVote(proposalId, Support.Against)).to.be.revertedWith(
      "Governor: vote not currently active"
    );

    await governor.connect(user2).functions["queue(address[],uint256[],bytes[],bytes32)"](
      [governor.address], // targets
      [0], // values
      [governor.interface.encodeFunctionData("updateTimelock", [user3.address])], // calldatas
      keccakString("update timelock") // description
    );

    await time.increase(5 * 24 * 60 * 60);

    await governor.connect(user2).functions["execute(address[],uint256[],bytes[],bytes32)"](
      [governor.address], // targets
      [0], // values
      [governor.interface.encodeFunctionData("updateTimelock", [user3.address])], // calldatas
      keccakString("update timelock") // description
    );
  });

  it("Guardian: More votes For than Against, For wins", async () => {
    await govToken.connect(wallet).mint(user1.address, 49_000);

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

    await govToken.connect(wallet).mint(user2.address, 100_000);
    await govToken.connect(user2).delegate(user2.address);

    await govToken.connect(wallet).mint(user3.address, 100_000);
    await govToken.connect(user3).delegate(user3.address);

    await govToken.connect(wallet).mint(user4.address, 100_000);
    await govToken.connect(user4).delegate(user4.address);

    await govToken.connect(wallet).mint(user5.address, 99_000);
    await govToken.connect(user5).delegate(user5.address);

    await time.increase(24 * 60 * 60);

    // 200_000 votes For
    await governor.connect(user2).castVote(proposalId, Support.For);
    await governor.connect(user3).castVote(proposalId, Support.For);

    // 199_000 votes Against
    await governor.connect(user4).castVote(proposalId, Support.Against);
    await governor.connect(user5).castVote(proposalId, Support.Against);

    expect(await governor.state(proposalId)).eq(State.Active);

    await time.increase(6 * 24 * 60 * 65);

    // State is now Succeeded
    expect(await governor.state(proposalId)).eq(State.Succeeded);

    // We can execute the proposal
    governor.connect(user2).functions["queue(address[],uint256[],bytes[],bytes32)"](
      [governor.address], // targets
      [0], // values
      [governor.interface.encodeFunctionData("updateTimelock", [user3.address])], // calldatas
      keccakString("update timelock") // description
    );

    governor.connect(user2).functions["execute(address[],uint256[],bytes[],bytes32)"](
      [governor.address], // targets
      [0], // values
      [governor.interface.encodeFunctionData("updateTimelock", [user3.address])], // calldatas
      keccakString("update timelock") // description
    );
  });

  it("Guardian: Two users vote for, two users vote against, the against win", async () => {
    await govToken.connect(wallet).mint(user1.address, 49_000);

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

    await govToken.connect(wallet).mint(user2.address, 100_000);
    await govToken.connect(user2).delegate(user2.address);

    await govToken.connect(wallet).mint(user3.address, 100_000);
    await govToken.connect(user3).delegate(user3.address);

    await govToken.connect(wallet).mint(user4.address, 100_000);
    await govToken.connect(user4).delegate(user4.address);

    await govToken.connect(wallet).mint(user5.address, 100_000);
    await govToken.connect(user5).delegate(user5.address);

    await time.increase(24 * 60 * 60);

    // 200_000 votes For
    await governor.connect(user2).castVote(proposalId, Support.For);
    await governor.connect(user3).castVote(proposalId, Support.For);

    // 200_000 votes Against
    await governor.connect(user4).castVote(proposalId, Support.Against);
    await governor.connect(user5).castVote(proposalId, Support.Against);

    expect(await governor.state(proposalId)).eq(State.Active);

    await time.increase(6 * 24 * 60 * 65);

    // State is now Defeated
    expect(await governor.state(proposalId)).eq(State.Defeated);

    // We can not execute the proposal
    await expect(
      governor.connect(user2).functions["queue(address[],uint256[],bytes[],bytes32)"](
        [governor.address], // targets
        [0], // values
        [governor.interface.encodeFunctionData("updateTimelock", [user3.address])], // calldatas
        keccakString("update timelock") // description
      )
    ).revertedWith("Governor: proposal not successful");

    await expect(
      governor.connect(user2).functions["execute(address[],uint256[],bytes[],bytes32)"](
        [governor.address], // targets
        [0], // values
        [governor.interface.encodeFunctionData("updateTimelock", [user3.address])], // calldatas
        keccakString("update timelock") // description
      )
    ).revertedWith("Governor: proposal not successful");
  });

  it("Guardian: Two users vote for, one user votes against, one user votes to abstain, the against wins", async () => {
    await govToken.connect(wallet).mint(user1.address, 49_000);

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

    await govToken.connect(wallet).mint(user2.address, 100_000);
    await govToken.connect(user2).delegate(user2.address);

    await govToken.connect(wallet).mint(user3.address, 100_000);
    await govToken.connect(user3).delegate(user3.address);

    await govToken.connect(wallet).mint(user4.address, 200_000);
    await govToken.connect(user4).delegate(user4.address);

    await govToken.connect(wallet).mint(user5.address, 200_000);
    await govToken.connect(user5).delegate(user5.address);

    await time.increase(24 * 60 * 60);

    // 200_000 votes For
    await governor.connect(user2).castVote(proposalId, Support.For);
    await governor.connect(user3).castVote(proposalId, Support.For);

    // 200_000 votes Against
    await governor.connect(user4).castVote(proposalId, Support.Against);

    // 200_000 votes Abstain
    await governor.connect(user5).castVote(proposalId, Support.Abstain);

    expect(await governor.state(proposalId)).eq(State.Active);

    await time.increase(6 * 24 * 60 * 65);

    // State is now Defeated
    expect(await governor.state(proposalId)).eq(State.Defeated);

    // We can not execute the proposal
    await expect(
      governor.connect(user2).functions["queue(address[],uint256[],bytes[],bytes32)"](
        [governor.address], // targets
        [0], // values
        [governor.interface.encodeFunctionData("updateTimelock", [user3.address])], // calldatas
        keccakString("update timelock") // description
      )
    ).revertedWith("Governor: proposal not successful");

    await expect(
      governor.connect(user2).functions["execute(address[],uint256[],bytes[],bytes32)"](
        [governor.address], // targets
        [0], // values
        [governor.interface.encodeFunctionData("updateTimelock", [user3.address])], // calldatas
        keccakString("update timelock") // description
      )
    ).revertedWith("Governor: proposal not successful");
  });

  it("Guardian: User delegates votes after a proposal", async () => {
    await govToken.connect(wallet).mint(user1.address, 49_000);

    await govToken.connect(wallet).mint(user1.address, 1000);
    await govToken.connect(user1).delegate(user1.address);

    await govToken.connect(wallet).mint(user4.address, 20_000);

    await mine(2);

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

    await govToken.connect(wallet).mint(user2.address, 240_000);
    await govToken.connect(user2).delegate(user2.address);

    await govToken.connect(wallet).mint(user3.address, 250_000);
    await govToken.connect(user3).delegate(user3.address);

    await time.increase(24 * 60 * 60);

    // 250_000 votes For
    await governor.connect(user3).castVote(proposalId, Support.For);

    // 240_000 votes Against
    await governor.connect(user2).castVote(proposalId, Support.Against);

    // User4 had 40_000 tokens prior to the proposal and delegates them to vote
    await govToken.connect(user4).delegate(user4.address);
    await governor.connect(user4).castVote(proposalId, Support.Against);

    expect(await governor.state(proposalId)).eq(State.Active);

    await time.increase(6 * 24 * 60 * 65);

    // User4's votes did not impact the proposal
    expect(await governor.state(proposalId)).eq(State.Succeeded);

    // We can execute the proposal
    governor.connect(user2).functions["queue(address[],uint256[],bytes[],bytes32)"](
      [governor.address], // targets
      [0], // values
      [governor.interface.encodeFunctionData("updateTimelock", [user3.address])], // calldatas
      keccakString("update timelock") // description
    );

    governor.connect(user2).functions["execute(address[],uint256[],bytes[],bytes32)"](
      [governor.address], // targets
      [0], // values
      [governor.interface.encodeFunctionData("updateTimelock", [user3.address])], // calldatas
      keccakString("update timelock") // description
    );
  });
});
