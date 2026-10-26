import { expect } from "chai";
import { ethers } from "hardhat";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals } from "../../utils/math";
import { grantRole } from "../../utils/role";
import { errorsContract } from "../../utils/error";

// the mocks reproduce the V1 cap-term shape only; the deposit / vest / claim /
// withdraw interplay with a closed cap is covered by the fork test suite
// against the real legacy Vester
describe("VesterCapZeroer", () => {
  const MAX = ethers.constants.MaxUint256;

  let fixture;
  let user0, user1, user2, keeper;
  let roleStore, eventEmitter;
  let esGmx, tracker, vester, zeroer;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1, user2 } = fixture.accounts);
    keeper = fixture.accounts.user7;
    ({ roleStore, eventEmitter } = fixture.contracts);

    esGmx = await (await ethers.getContractFactory("MockEsGmxV1")).deploy("esGMX", "esGMX", 18);
    tracker = await (
      await ethers.getContractFactory("MockLegacyRewardTrackerV1")
    ).deploy("Staked GMX", "sGMX", esGmx.address);
    vester = await (await ethers.getContractFactory("MockLegacyVesterV1")).deploy(tracker.address);
    zeroer = await (
      await ethers.getContractFactory("VesterCapZeroer")
    ).deploy(roleStore.address, eventEmitter.address, vester.address);

    await grantRole(roleStore, zeroer.address, "CONTROLLER");
    await grantRole(roleStore, keeper.address, "INCENTIVE_DISTRIBUTOR");
  });

  it("targets the vester", async () => {
    expect(await zeroer.vester()).eq(vester.address);
  });

  it("gates the keeper role", async () => {
    await expect(zeroer.connect(user0).zeroCaps([user0.address])).to.be.revertedWithCustomError(
      errorsContract,
      "Unauthorized"
    );
  });

  it("cannot run without handler status on the vester", async () => {
    await vester.setBonusRewards(user0.address, expandDecimals(1000, 18));
    await expect(zeroer.connect(keeper).zeroCaps([user0.address])).to.be.revertedWith("Vester: forbidden");
  });

  it("closes every listed account with the maximum deduction", async () => {
    await vester.setHandler(zeroer.address, true);

    await vester.setBonusRewards(user0.address, expandDecimals(1000, 18));
    await vester.setTransferredCumulativeRewards(user1.address, expandDecimals(500, 18));
    await tracker.setCumulativeRewards(user1.address, expandDecimals(300, 18));

    expect(await zeroer.isZeroed(user0.address)).eq(false);
    expect(await zeroer.isZeroed(user2.address)).eq(false);

    await zeroer.connect(keeper).zeroCaps([user0.address, user1.address, user2.address]);

    expect(await vester.cumulativeRewardDeductions(user0.address)).eq(MAX);
    expect(await vester.cumulativeRewardDeductions(user1.address)).eq(MAX);
    expect(await vester.cumulativeRewardDeductions(user2.address)).eq(MAX);
    expect(await vester.getMaxVestableAmount(user0.address)).eq(0);
    expect(await vester.getMaxVestableAmount(user1.address)).eq(0);
    expect(await zeroer.isZeroed(user0.address)).eq(true);
    expect(await zeroer.isZeroed(user2.address)).eq(true);
  });

  it("closes an account whose cap is zero until pending tracker rewards land", async () => {
    await vester.setHandler(zeroer.address, true);
    await tracker.setClaimable(user0.address, expandDecimals(40, 18));
    expect(await vester.getMaxVestableAmount(user0.address)).eq(0);

    await zeroer.connect(keeper).zeroCaps([user0.address]);

    await tracker.setCumulativeRewards(user0.address, expandDecimals(40, 18));
    expect(await vester.getMaxVestableAmount(user0.address)).eq(0);
    expect(await zeroer.isZeroed(user0.address)).eq(true);
  });

  it("stays closed when caps are credited after zeroing", async () => {
    await vester.setHandler(zeroer.address, true);
    await vester.setBonusRewards(user0.address, expandDecimals(1000, 18));
    await zeroer.connect(keeper).zeroCaps([user0.address]);

    await vester.setBonusRewards(user0.address, expandDecimals(1200, 18));
    await vester.setTransferredCumulativeRewards(user0.address, expandDecimals(700, 18));
    await tracker.setCumulativeRewards(user0.address, expandDecimals(300, 18));
    await tracker.setClaimable(user0.address, expandDecimals(40, 18));

    expect(await vester.getMaxVestableAmount(user0.address)).eq(0);
    expect(await zeroer.isZeroed(user0.address)).eq(true);

    // a second pass is a no-op: nothing to close
    await zeroer.connect(keeper).zeroCaps([user0.address]);
    expect(await vester.cumulativeRewardDeductions(user0.address)).eq(MAX);
  });

  it("replaces a lower deduction that closes the cap only today", async () => {
    await vester.setHandler(zeroer.address, true);
    await vester.setHandler(fixture.accounts.wallet.address, true);
    await vester.setTransferredCumulativeRewards(user1.address, expandDecimals(500, 18));
    await vester
      .connect(fixture.accounts.wallet)
      .setCumulativeRewardDeductions(user1.address, expandDecimals(5000, 18));

    expect(await zeroer.isZeroed(user1.address)).eq(false);
    await zeroer.connect(keeper).zeroCaps([user1.address]);
    expect(await vester.cumulativeRewardDeductions(user1.address)).eq(MAX);
  });

  it("zeroes caps on a vester with no reward tracker", async () => {
    const trackerlessVester = await (
      await ethers.getContractFactory("MockLegacyVesterV1")
    ).deploy(ethers.constants.AddressZero);
    const trackerlessZeroer = await (
      await ethers.getContractFactory("VesterCapZeroer")
    ).deploy(roleStore.address, eventEmitter.address, trackerlessVester.address);
    await grantRole(roleStore, trackerlessZeroer.address, "CONTROLLER");
    await trackerlessVester.setHandler(trackerlessZeroer.address, true);

    await trackerlessVester.setBonusRewards(user0.address, expandDecimals(1000, 18));
    await trackerlessVester.setTransferredCumulativeRewards(user0.address, expandDecimals(200, 18));

    await trackerlessZeroer.connect(keeper).zeroCaps([user0.address]);
    expect(await trackerlessVester.cumulativeRewardDeductions(user0.address)).eq(MAX);
    expect(await trackerlessVester.getMaxVestableAmount(user0.address)).eq(0);
    expect(await trackerlessZeroer.isZeroed(user0.address)).eq(true);
  });
});
