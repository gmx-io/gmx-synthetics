import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import { deployFixture } from "../../utils/fixture";
import { grantRole } from "../../utils/role";
import { errorsContract } from "../../utils/error";
import * as keys from "../../utils/keys";

describe("Oracle.sequencerUptimeFeed", () => {
  const SEQUENCER_GRACE_DURATION = 300;
  const emptyParams = { tokens: [], providers: [], data: [] };

  let roleStore, dataStore, eventEmitter, chainlinkPriceFeedProvider, wnt;
  let mockSequencerUptimeFeed, oracleWithSequencerFeed, nonEmptyParams;

  beforeEach(async () => {
    const fixture = await deployFixture();
    ({ roleStore, dataStore, eventEmitter, chainlinkPriceFeedProvider, wnt } = fixture.contracts);

    mockSequencerUptimeFeed = await (await ethers.getContractFactory("MockSequencerUptimeFeed")).deploy();

    oracleWithSequencerFeed = await (
      await ethers.getContractFactory("Oracle")
    ).deploy(roleStore.address, dataStore.address, eventEmitter.address, mockSequencerUptimeFeed.address);

    await grantRole(roleStore, oracleWithSequencerFeed.address, "CONTROLLER");

    await dataStore.setUint(keys.SEQUENCER_GRACE_DURATION, SEQUENCER_GRACE_DURATION);

    nonEmptyParams = { tokens: [wnt.address], providers: [chainlinkPriceFeedProvider.address], data: ["0x"] };
  });

  it("setPricesForAtomicAction with empty params succeeds when the sequencer is down", async () => {
    await mockSequencerUptimeFeed.setAnswer(1);
    await expect(oracleWithSequencerFeed.setPricesForAtomicAction(emptyParams)).to.not.be.reverted;
    expect(await oracleWithSequencerFeed.getTokensWithPricesCount()).eq(0);
  });

  it("setPricesForAtomicAction with empty params succeeds within the grace duration", async () => {
    await mockSequencerUptimeFeed.setAnswer(0);
    await mockSequencerUptimeFeed.setStartedAt(await time.latest());
    await expect(oracleWithSequencerFeed.setPricesForAtomicAction(emptyParams)).to.not.be.reverted;
    expect(await oracleWithSequencerFeed.getTokensWithPricesCount()).eq(0);
  });

  it("setPricesForAtomicAction with prices reverts when the sequencer is down", async () => {
    await mockSequencerUptimeFeed.setAnswer(1);
    await expect(oracleWithSequencerFeed.setPricesForAtomicAction(nonEmptyParams)).to.be.revertedWithCustomError(
      errorsContract,
      "SequencerDown"
    );
  });

  it("setPricesForAtomicAction with prices reverts within the grace duration", async () => {
    await mockSequencerUptimeFeed.setAnswer(0);
    await mockSequencerUptimeFeed.setStartedAt(await time.latest());
    await expect(oracleWithSequencerFeed.setPricesForAtomicAction(nonEmptyParams)).to.be.revertedWithCustomError(
      errorsContract,
      "SequencerGraceDurationNotYetPassed"
    );
  });

  it("setPricesForAtomicAction with prices succeeds when the sequencer is up and the grace duration has passed", async () => {
    await mockSequencerUptimeFeed.setAnswer(0);
    await mockSequencerUptimeFeed.setStartedAt((await time.latest()) - SEQUENCER_GRACE_DURATION - 60);

    await oracleWithSequencerFeed.setPricesForAtomicAction(nonEmptyParams);

    expect(await oracleWithSequencerFeed.getTokensWithPricesCount()).eq(1);
    expect((await oracleWithSequencerFeed.primaryPrices(wnt.address))[0]).gt(0);
  });

  it("setPricesForAtomicAction with prices enforces the grace duration boundary exactly", async () => {
    await mockSequencerUptimeFeed.setAnswer(0);
    const startedAt = await time.latest();
    await mockSequencerUptimeFeed.setStartedAt(startedAt);

    await time.setNextBlockTimestamp(startedAt + SEQUENCER_GRACE_DURATION);
    await expect(oracleWithSequencerFeed.setPricesForAtomicAction(nonEmptyParams)).to.be.revertedWithCustomError(
      errorsContract,
      "SequencerGraceDurationNotYetPassed"
    );

    await time.setNextBlockTimestamp(startedAt + SEQUENCER_GRACE_DURATION + 1);
    await oracleWithSequencerFeed.setPricesForAtomicAction(nonEmptyParams);
    expect(await oracleWithSequencerFeed.getTokensWithPricesCount()).eq(1);
  });

  it("non-atomic setPrices is not blocked by the sequencer", async () => {
    await mockSequencerUptimeFeed.setAnswer(1);

    await dataStore.setAddress(
      keys.oracleProviderForTokenKey(oracleWithSequencerFeed.address, wnt.address),
      chainlinkPriceFeedProvider.address
    );

    await oracleWithSequencerFeed.setPrices(nonEmptyParams);
    expect(await oracleWithSequencerFeed.getTokensWithPricesCount()).eq(1);
  });

  it("skips the sequencer check for empty tokens but still reverts on mismatched array lengths", async () => {
    await mockSequencerUptimeFeed.setAnswer(1);
    await expect(
      oracleWithSequencerFeed.setPricesForAtomicAction({
        tokens: [],
        providers: [chainlinkPriceFeedProvider.address],
        data: ["0x"],
      })
    ).to.be.revertedWithCustomError(errorsContract, "InvalidOracleSetPricesProvidersParam");
  });
});
