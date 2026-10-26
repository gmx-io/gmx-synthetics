import { expect } from "chai";
import { ethers } from "hardhat";
import { time, mine } from "@nomicfoundation/hardhat-network-helpers";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals } from "../../utils/math";
import { grantRole } from "../../utils/role";
import { errorsContract } from "../../utils/error";
import { parseLogs, getEventData } from "../../utils/event";
import * as keys from "../../utils/keys";

const { AddressZero, MaxUint256 } = ethers.constants;
const secondsPerYear = 365 * 24 * 60 * 60;
const PAIR_PRECISION = expandDecimals(1, 30);

// the trackers and legacy vesters are bookkeeping mocks; the four-tracker custody
// chain, handler gating, and the differential against the deployed RewardRouterV2
// are covered by the fork test suite against the real V1 contracts
describe("RewardRouterV3", () => {
  let fixture;
  let wallet, user0, user1, user2, guardian, distributor, incentiveAdmin;
  let roleStore, dataStore, eventEmitter;
  let gmx, esGmx, bnGmx, weth, glp;
  let stakedGmxTracker, bonusGmxTracker, extendedGmxTracker, feeGmxTracker;
  let feeGlpTracker, stakedGlpTracker;
  let gmxVester, glpVester;
  let issuer, season, orphan;
  let router;
  let routerFactory;
  let batchIndex;

  const deployTracker = async (name, symbol, rewardToken) => {
    return await (await ethers.getContractFactory("MockLegacyRewardTrackerV1")).deploy(name, symbol, rewardToken);
  };

  const routerParams = () => ({
    roleStore: roleStore.address,
    dataStore: dataStore.address,
    eventEmitter: eventEmitter.address,
    weth: weth.address,
    gmx: gmx.address,
    esGmx: esGmx.address,
    bnGmx: bnGmx.address,
    glp: glp.address,
    stakedGmxTracker: stakedGmxTracker.address,
    bonusGmxTracker: bonusGmxTracker.address,
    extendedGmxTracker: extendedGmxTracker.address,
    feeGmxTracker: feeGmxTracker.address,
    feeGlpTracker: feeGlpTracker.address,
    stakedGlpTracker: stakedGlpTracker.address,
    gmxVester: gmxVester.address,
    glpVester: glpVester.address,
    externalHandler: AddressZero,
    govToken: AddressZero,
    esGmxIssuer: issuer.address,
    maxBoostBasisPoints: 0,
    inStrictTransferMode: false,
    votingPowerType: 0,
  });

  const vesterParams = (name, symbol, issuerAddress, pairFactor) => ({
    roleStore: roleStore.address,
    dataStore: dataStore.address,
    eventEmitter: eventEmitter.address,
    name,
    symbol,
    vestingDuration: secondsPerYear,
    esToken: esGmx.address,
    pairToken: feeGmxTracker.address,
    claimableToken: gmx.address,
    issuer: issuerAddress,
    pairRatioFactor: PAIR_PRECISION.mul(pairFactor),
    isUncapped: false,
  });

  const stakeGmxFor = async (account, amount) => {
    await gmx.mint(account.address, amount);
    await router.connect(account).stakeGmx(amount);
  };

  const issueTo = async (account, amount) => {
    batchIndex += 1;
    await issuer.connect(distributor).distributeEpoch(1, batchIndex, [account.address], [amount]);
  };

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ wallet, user0, user1, user2 } = fixture.accounts);
    guardian = fixture.accounts.user6;
    distributor = fixture.accounts.user7;
    incentiveAdmin = fixture.accounts.user8;
    ({ roleStore, dataStore, eventEmitter } = fixture.contracts);

    batchIndex = 0;

    gmx = await (await ethers.getContractFactory("MintableToken")).deploy("GMX", "GMX", 18);
    esGmx = await (await ethers.getContractFactory("MockEsGmxV1")).deploy("esGMX", "esGMX", 18);
    bnGmx = await (await ethers.getContractFactory("MintableToken")).deploy("Bonus GMX", "bnGMX", 18);
    weth = await (await ethers.getContractFactory("MintableToken")).deploy("WETH", "WETH", 18);
    glp = await (await ethers.getContractFactory("MintableToken")).deploy("GMX LP", "GLP", 18);

    stakedGmxTracker = await deployTracker("Staked GMX", "sGMX", esGmx.address);
    bonusGmxTracker = await deployTracker("Staked + Bonus GMX", "sbGMX", bnGmx.address);
    extendedGmxTracker = await deployTracker("Staked + Bonus + Extended GMX", "sbeGMX", gmx.address);
    feeGmxTracker = await deployTracker("Staked + Bonus + Fee GMX", "sbfGMX", weth.address);
    feeGlpTracker = await deployTracker("Fee GLP", "fGLP", weth.address);
    stakedGlpTracker = await deployTracker("Fee + Staked GLP", "fsGLP", esGmx.address);

    gmxVester = await (await ethers.getContractFactory("MockLegacyVesterV1")).deploy(stakedGmxTracker.address);
    glpVester = await (await ethers.getContractFactory("MockLegacyVesterV1")).deploy(stakedGlpTracker.address);

    issuer = await (
      await ethers.getContractFactory("EsGmxIssuer")
    ).deploy(roleStore.address, dataStore.address, eventEmitter.address, esGmx.address);
    season = await (
      await ethers.getContractFactory("RatioVester")
    ).deploy(vesterParams("Vested GMX S1", "vGMX-S1", issuer.address, 5));
    orphan = await (
      await ethers.getContractFactory("RatioVester")
    ).deploy(vesterParams("Vested GMX Orphan", "vGMX-O", AddressZero, 10));

    const rewardRouterUtils = await (await ethers.getContractFactory("RewardRouterUtils")).deploy();
    const incentiveEventUtils = await (await ethers.getContractFactory("IncentiveEventUtils")).deploy();
    routerFactory = await ethers.getContractFactory("RewardRouterV3", {
      libraries: {
        RewardRouterUtils: rewardRouterUtils.address,
        IncentiveEventUtils: incentiveEventUtils.address,
      },
    });
    router = await routerFactory.deploy(routerParams());

    await grantRole(roleStore, router.address, "CONTROLLER");
    await grantRole(roleStore, wallet.address, "CONTROLLER");
    await grantRole(roleStore, issuer.address, "CONTROLLER");
    await grantRole(roleStore, season.address, "CONTROLLER");
    await grantRole(roleStore, orphan.address, "CONTROLLER");
    await grantRole(roleStore, wallet.address, "TIMELOCK_ADMIN");
    await grantRole(roleStore, guardian.address, "INCENTIVE_GUARDIAN");
    await grantRole(roleStore, distributor.address, "INCENTIVE_DISTRIBUTOR");
    await grantRole(roleStore, incentiveAdmin.address, "INCENTIVE_ADMIN");

    await router.addDesignatedVester(season.address);
    await router.addDesignatedVester(orphan.address);

    await esGmx.setHandler(router.address, true);

    await issuer.setVester(season.address);
    await season.confirmIssuerBinding();
    await season.connect(incentiveAdmin).setProvisioningComplete();

    await orphan.connect(incentiveAdmin).setProvisionCaps([user0.address], [expandDecimals(1000, 18)]);
    await orphan.connect(incentiveAdmin).setProvisioningComplete();

    await esGmx.mint(issuer.address, expandDecimals(1000000, 18));
    await gmx.mint(season.address, expandDecimals(1000000, 18));
    await gmx.mint(orphan.address, expandDecimals(1000000, 18));
  });

  it("stakes through the full four-tracker chain", async () => {
    await stakeGmxFor(user0, expandDecimals(100, 18));
    expect(await stakedGmxTracker.stakedAmounts(user0.address)).eq(expandDecimals(100, 18));
    expect(await feeGmxTracker.stakedAmounts(user0.address)).eq(expandDecimals(100, 18));
    expect(await feeGmxTracker.balanceOf(user0.address)).eq(expandDecimals(100, 18));
  });

  it("proxy binds the caller and rejects non-designated vesters", async () => {
    await issueTo(user0, expandDecimals(1000, 18));
    await router.connect(user0).issuerClaim();
    expect(await esGmx.balanceOf(user0.address)).eq(expandDecimals(1000, 18));

    await stakeGmxFor(user0, expandDecimals(5000, 18));
    await esGmx.connect(user0).approve(season.address, expandDecimals(1000, 18));
    await feeGmxTracker.connect(user0).approve(season.address, MaxUint256);

    await expect(
      router.connect(user0).vesterDeposit(gmxVester.address, expandDecimals(1000, 18))
    ).to.be.revertedWithCustomError(errorsContract, "InvalidDesignatedVester");

    await router.connect(user0).vesterDeposit(season.address, expandDecimals(1000, 18));
    expect(await season.balances(user0.address)).eq(expandDecimals(1000, 18));
    expect(await season.pairAmounts(user0.address)).eq(expandDecimals(5000, 18));
    expect(await feeGmxTracker.balanceOf(season.address)).eq(expandDecimals(5000, 18));
    expect(await feeGmxTracker.stakedAmounts(season.address)).eq(0);

    await time.increase(100 * 24 * 60 * 60);
    await mine();
    await router.connect(user0).vesterClaim(season.address);
    expect(await gmx.balanceOf(user0.address)).gt(expandDecimals(273, 18));

    await router.connect(user0).vesterWithdraw(season.address);
    expect(await feeGmxTracker.balanceOf(user0.address)).eq(expandDecimals(5000, 18));
  });

  it("syncs aggregate fee tracker attribution before every vester deposit", async () => {
    await issueTo(user0, expandDecimals(20, 18));
    await router.connect(user0).issuerClaim();
    await stakeGmxFor(user0, expandDecimals(200, 18));

    await feeGmxTracker.connect(user0).transfer(gmxVester.address, expandDecimals(30, 18));
    await gmxVester.setPairAmount(user0.address, expandDecimals(30, 18));

    await esGmx.connect(user0).approve(season.address, MaxUint256);
    await esGmx.connect(user0).approve(orphan.address, MaxUint256);
    await feeGmxTracker.connect(user0).approve(router.address, MaxUint256);
    await feeGmxTracker.connect(user0).approve(season.address, MaxUint256);
    await feeGmxTracker.connect(user0).approve(orphan.address, MaxUint256);

    await router.connect(user0).vesterDeposit(season.address, expandDecimals(10, 18));
    await router.connect(user0).vesterDeposit(orphan.address, expandDecimals(5, 18));

    expect(await feeGmxTracker.balanceOf(user0.address)).eq(expandDecimals(70, 18));
    expect(await gmxVester.pairAmounts(user0.address)).eq(expandDecimals(30, 18));
    expect(await season.pairAmounts(user0.address)).eq(expandDecimals(50, 18));
    expect(await orphan.pairAmounts(user0.address)).eq(expandDecimals(50, 18));

    await feeGmxTracker.mint(user0.address, expandDecimals(20, 18));
    await router.connect(user0).vesterDeposit(season.address, expandDecimals(2, 18));

    expect(await feeGmxTracker.balanceOf(gmxVester.address)).eq(expandDecimals(50, 18));
    expect(await orphan.pairAmounts(user0.address)).eq(expandDecimals(50, 18));

    const attributedAmount = (await feeGmxTracker.balanceOf(user0.address))
      .add(await gmxVester.pairAmounts(user0.address))
      .add(await season.pairAmounts(user0.address))
      .add(await orphan.pairAmounts(user0.address));
    expect(attributedAmount).eq(await feeGmxTracker.stakedAmounts(user0.address));
  });

  it("blocks a vester deposit when the unbacked amount is already locked", async () => {
    await issueTo(user0, expandDecimals(1, 18));
    await router.connect(user0).issuerClaim();
    await stakeGmxFor(user0, expandDecimals(100, 18));
    await gmxVester.setPairAmount(user0.address, expandDecimals(150, 18));

    await esGmx.connect(user0).approve(season.address, MaxUint256);
    await feeGmxTracker.connect(user0).approve(router.address, MaxUint256);
    await feeGmxTracker.connect(user0).approve(season.address, MaxUint256);

    await expect(router.connect(user0).vesterDeposit(season.address, expandDecimals(1, 18)))
      .to.be.revertedWithCustomError(errorsContract, "UnbackedPairAmountLocked")
      .withArgs(user0.address, expandDecimals(150, 18), expandDecimals(100, 18));
  });

  it("a zeroed sender with legacy bonusRewards transfers cleanly", async () => {
    // simulate the post-zeroing state: bonusRewards > 0 and a deduction above the
    // tracker's cumulative rewards; V2's deleted transferStakeValues call underflows
    // on this state, which the fork suite demonstrates against the real V2
    await gmxVester.setBonusRewards(user0.address, expandDecimals(1000, 18));
    await gmxVester.setHandler(wallet.address, true);
    await gmxVester.connect(wallet).setCumulativeRewardDeductions(user0.address, expandDecimals(1000, 18));

    await stakeGmxFor(user0, expandDecimals(100, 18));

    await router.connect(user0).signalTransfer(user1.address);
    expect(await router.pendingReceivers(user0.address)).eq(user1.address);
    expect(await dataStore.getAddress(keys.pendingReceiverKey(user0.address))).eq(user1.address);
    expect(await router.pendingTransferVesterVersions(user0.address)).eq(await router.vesterConfigVersion());
    expect(await dataStore.getUint(keys.pendingTransferVesterVersionKey(user0.address))).eq(
      await router.vesterConfigVersion()
    );
    await expect(router.connect(user2).acceptTransfer(user0.address)).to.be.revertedWithCustomError(
      errorsContract,
      "TransferNotSignalled"
    );

    await router.connect(user1).acceptTransfer(user0.address);
    expect(await router.pendingReceivers(user0.address)).eq(AddressZero);
    expect(await router.pendingTransferVesterVersions(user0.address)).eq(0);
    expect(await feeGmxTracker.stakedAmounts(user1.address)).eq(expandDecimals(100, 18));
    expect(await feeGmxTracker.stakedAmounts(user0.address)).eq(0);
  });

  it("claims pending issuance to the sender before the sweep and moves the cap", async () => {
    await issueTo(user0, expandDecimals(500, 18));
    await stakeGmxFor(user0, expandDecimals(10, 18));

    await router.connect(user0).signalTransfer(user1.address);
    await router.connect(user1).acceptTransfer(user0.address);

    expect(await esGmx.balanceOf(user1.address)).eq(expandDecimals(500, 18));
    expect(await esGmx.balanceOf(user0.address)).eq(0);
    expect(await issuer.claimable(user0.address)).eq(0);
    expect(await season.transferredCaps(user1.address)).eq(expandDecimals(500, 18));
    expect(await season.getVestingCap(user0.address)).eq(0);
    expect(await season.isFreshForTransfer(user1.address)).eq(false);
  });

  it("rejects an EOA or empty address as a designated vester", async () => {
    await expect(router.addDesignatedVester(user0.address)).to.be.reverted;
    await expect(router.addDesignatedVester(AddressZero)).to.be.reverted;
    expect(await router.designatedVestersLength()).eq(2);
  });

  it("only removes a deactivated vester after all escrow and collateral are withdrawn", async () => {
    await stakeGmxFor(user0, expandDecimals(100, 18));
    await esGmx.mint(user0.address, expandDecimals(10, 18));
    await esGmx.connect(user0).approve(orphan.address, expandDecimals(10, 18));
    await feeGmxTracker.connect(user0).approve(orphan.address, MaxUint256);
    await router.connect(user0).vesterDeposit(orphan.address, expandDecimals(10, 18));

    await expect(router.removeDesignatedVester(orphan.address)).to.be.revertedWithCustomError(
      errorsContract,
      "DesignatedVesterNotDrained"
    );

    await orphan.setDeactivatedAt((await time.latest()) + 7 * 24 * 60 * 60 + 1);
    await time.increase(7 * 24 * 60 * 60 + 1);
    expect(await orphan.isDrainedForRemoval()).eq(false);

    await router.connect(user0).vesterWithdraw(orphan.address);
    expect(await orphan.isDrainedForRemoval()).eq(false);
    await router.connect(user0).vesterClaim(orphan.address);
    expect(await orphan.isDrainedForRemoval()).eq(true);
    await router.removeDesignatedVester(orphan.address);

    expect(await router.isDesignatedVester(orphan.address)).eq(false);
    expect(await router.designatedVestersLength()).eq(1);
    await expect(router.connect(user0).vesterDeposit(orphan.address, 1)).to.be.revertedWithCustomError(
      errorsContract,
      "InvalidDesignatedVester"
    );
  });

  it("does not remove a bound vester until all issuer allocations are claimed", async () => {
    await issueTo(user0, expandDecimals(500, 18));
    await season.setDeactivatedAt((await time.latest()) + 7 * 24 * 60 * 60 + 1);
    await time.increase(7 * 24 * 60 * 60 + 1);

    expect(await season.isDrainedForRemoval()).eq(false);
    await expect(router.removeDesignatedVester(season.address)).to.be.revertedWithCustomError(
      errorsContract,
      "DesignatedVesterNotDrained"
    );

    await router.connect(user0).issuerClaim();
    expect(await season.isDrainedForRemoval()).eq(true);
    await router.removeDesignatedVester(season.address);
    expect(await router.isDesignatedVester(season.address)).eq(false);
  });

  it("invalidates a pending transfer when a vester is designated", async () => {
    const later = await (
      await ethers.getContractFactory("RatioVester")
    ).deploy(vesterParams("Vested GMX Later", "vGMX-L", AddressZero, 10));
    await grantRole(roleStore, later.address, "CONTROLLER");
    await later.connect(incentiveAdmin).setProvisionCaps([user0.address], [expandDecimals(250, 18)]);
    await later.connect(incentiveAdmin).setProvisioningComplete();

    await stakeGmxFor(user0, expandDecimals(10, 18));
    await router.connect(user0).signalTransfer(user1.address);
    await router.addDesignatedVester(later.address);

    await expect(router.connect(user1).acceptTransfer(user0.address)).to.be.revertedWithCustomError(
      errorsContract,
      "TransferVesterConfigChanged"
    );
    expect(await feeGmxTracker.stakedAmounts(user0.address)).eq(expandDecimals(10, 18));
    expect(await router.pendingReceivers(user0.address)).eq(user1.address);

    await router.connect(user0).signalTransfer(user1.address);
    await router.connect(user1).acceptTransfer(user0.address);
    expect(await feeGmxTracker.stakedAmounts(user1.address)).eq(expandDecimals(10, 18));
    expect(await later.getVestingCap(user0.address)).eq(0);
    expect(await later.transferredCaps(user1.address)).eq(expandDecimals(250, 18));
  });

  it("invalidates a pending transfer when a drained vester is removed", async () => {
    await stakeGmxFor(user0, expandDecimals(10, 18));
    await router.connect(user0).signalTransfer(user1.address);
    await orphan.setDeactivatedAt((await time.latest()) + 7 * 24 * 60 * 60 + 1);
    await time.increase(7 * 24 * 60 * 60 + 1);
    await router.removeDesignatedVester(orphan.address);

    await expect(router.connect(user1).acceptTransfer(user0.address)).to.be.revertedWithCustomError(
      errorsContract,
      "TransferVesterConfigChanged"
    );
    expect(await feeGmxTracker.stakedAmounts(user0.address)).eq(expandDecimals(10, 18));
    expect(await router.pendingReceivers(user0.address)).eq(user1.address);

    await router.connect(user0).signalTransfer(user1.address);
    await router.connect(user1).acceptTransfer(user0.address);
    expect(await feeGmxTracker.stakedAmounts(user1.address)).eq(expandDecimals(10, 18));
  });

  it("an unpayable pending claim blocks the transfer", async () => {
    await issueTo(user0, expandDecimals(500, 18));
    await stakeGmxFor(user0, expandDecimals(10, 18));
    await dataStore.setBool(keys.incentiveIssuerClaimFeatureDisabledKey(issuer.address), true);

    await router.connect(user0).signalTransfer(user1.address);
    await expect(router.connect(user1).acceptTransfer(user0.address)).to.be.revertedWithCustomError(
      errorsContract,
      "DisabledFeature"
    );
  });

  it("a sender mid-session in either new vester is blocked", async () => {
    await issueTo(user0, expandDecimals(100, 18));
    await router.connect(user0).issuerClaim();
    await stakeGmxFor(user0, expandDecimals(1000, 18));
    await esGmx.connect(user0).approve(season.address, expandDecimals(100, 18));
    await feeGmxTracker.connect(user0).approve(season.address, MaxUint256);
    await router.connect(user0).vesterDeposit(season.address, expandDecimals(100, 18));

    await expect(router.connect(user0).signalTransfer(user1.address)).to.be.revertedWithCustomError(
      errorsContract,
      "VestingSenderHasOpenSession"
    );

    await router.connect(user0).vesterWithdraw(season.address);

    const esBalance = await esGmx.balanceOf(user0.address);
    await esGmx.connect(user0).approve(orphan.address, esBalance);
    await feeGmxTracker.connect(user0).approve(orphan.address, MaxUint256);
    await router.connect(user0).vesterDeposit(orphan.address, esBalance);
    await expect(router.connect(user0).signalTransfer(user1.address)).to.be.revertedWithCustomError(
      errorsContract,
      "VestingSenderHasOpenSession"
    );
  });

  it("a frozen sender or receiver is rejected at signal", async () => {
    await stakeGmxFor(user0, expandDecimals(100, 18));

    await season.connect(guardian).setAccountFrozen(user1.address, true);
    await expect(router.connect(user0).signalTransfer(user1.address)).to.be.revertedWithCustomError(
      errorsContract,
      "StakingReceiverNotFresh"
    );
    await season.connect(guardian).setAccountFrozen(user1.address, false);

    await season.connect(guardian).setAccountFrozen(user0.address, true);
    await expect(router.connect(user0).signalTransfer(user1.address)).to.be.revertedWithCustomError(
      errorsContract,
      "VesterAccountFrozen"
    );
  });

  it("a self-target is rejected at signal", async () => {
    await expect(router.connect(user0).signalTransfer(user0.address)).to.be.revertedWithCustomError(
      errorsContract,
      "SelfVestingTransfer"
    );
  });

  it("a disabled transfer feature is rejected at signal", async () => {
    await stakeGmxFor(user0, expandDecimals(100, 18));
    await dataStore.setBool(keys.incentiveVesterTransferFeatureDisabledKey(season.address), true);
    await expect(router.connect(user0).signalTransfer(user1.address)).to.be.revertedWithCustomError(
      errorsContract,
      "DisabledFeature"
    );
    await dataStore.setBool(keys.incentiveVesterTransferFeatureDisabledKey(season.address), false);
    await router.connect(user0).signalTransfer(user1.address);
  });

  it("adds the legacy pairAmounts check the balance-only check misses", async () => {
    await stakeGmxFor(user0, expandDecimals(1000, 18));
    await gmxVester.setPairAmount(user0.address, expandDecimals(1000, 18));

    await expect(router.connect(user0).signalTransfer(user1.address)).to.be.revertedWithCustomError(
      errorsContract,
      "StakingSenderHasPairAmounts"
    );
  });

  it("an empty designated-vester allowlist blocks transfers", async () => {
    const bare = await routerFactory.deploy(routerParams());
    await expect(bare.connect(user0).signalTransfer(user1.address)).to.be.revertedWithCustomError(
      errorsContract,
      "EmptyDesignatedVesters"
    );
    await expect(bare.connect(user1).acceptTransfer(user0.address)).to.be.revertedWithCustomError(
      errorsContract,
      "EmptyDesignatedVesters"
    );
  });

  it("compound succeeds with pair collateral locked in a new vester", async () => {
    await issueTo(user0, expandDecimals(1000, 18));
    await router.connect(user0).issuerClaim();
    await stakeGmxFor(user0, expandDecimals(6000, 18));
    await esGmx.connect(user0).approve(season.address, expandDecimals(1000, 18));
    await feeGmxTracker.connect(user0).approve(season.address, MaxUint256);
    await router.connect(user0).vesterDeposit(season.address, expandDecimals(1000, 18));

    await router.connect(user0).compound();
    expect(await feeGmxTracker.stakedAmounts(user0.address)).eq(expandDecimals(6000, 18));
  });

  it("restaking mode converts an old-layout account and returns the legacy pair", async () => {
    await router.setInRestakingMode(true);

    await stakeGmxFor(user0, expandDecimals(10, 18));
    await feeGmxTracker.stakeForAccount(user0.address, user0.address, bonusGmxTracker.address, expandDecimals(4, 18));

    await feeGmxTracker.mint(gmxVester.address, expandDecimals(2, 18));
    await gmxVester.setPairAmount(user0.address, expandDecimals(2, 18));
    await gmxVester.approveToken(feeGmxTracker.address, router.address, MaxUint256);
    await feeGmxTracker.connect(user0).approve(router.address, MaxUint256);

    await router.connect(user0).compound();

    expect(await feeGmxTracker.depositBalances(user0.address, bonusGmxTracker.address)).eq(0);
    expect(await extendedGmxTracker.depositBalances(user0.address, bonusGmxTracker.address)).eq(expandDecimals(14, 18));
    expect(await feeGmxTracker.depositBalances(user0.address, extendedGmxTracker.address)).eq(expandDecimals(14, 18));
    expect(await feeGmxTracker.balanceOf(gmxVester.address)).eq(expandDecimals(2, 18));
    expect(await feeGmxTracker.balanceOf(user0.address)).eq(expandDecimals(14, 18));
  });

  describe("restaking with legacy vester pair collateral", () => {
    // old layout: the base stake and the bonus bnGmx sit directly in the fee tracker,
    // and the legacy vester holds part of the fee tracker receipts as pair collateral
    const setupAccount = async ({ base, oldBonus, extendedBonus, pair }) => {
      await stakedGmxTracker.stakeForAccount(user0.address, user0.address, gmx.address, base);
      await bonusGmxTracker.stakeForAccount(user0.address, user0.address, stakedGmxTracker.address, base);
      await feeGmxTracker.stakeForAccount(user0.address, user0.address, bonusGmxTracker.address, base);
      await feeGmxTracker.stakeForAccount(user0.address, user0.address, bnGmx.address, oldBonus);
      if (extendedBonus.gt(0)) {
        await extendedGmxTracker.stakeForAccount(user0.address, user0.address, bnGmx.address, extendedBonus);
        await feeGmxTracker.stakeForAccount(user0.address, user0.address, extendedGmxTracker.address, extendedBonus);
      }

      await feeGmxTracker.connect(user0).transfer(gmxVester.address, pair);
      await gmxVester.setPairAmount(user0.address, pair);
      await gmxVester.approveToken(feeGmxTracker.address, router.address, MaxUint256);
      await feeGmxTracker.connect(user0).approve(router.address, MaxUint256);

      await router.setInRestakingMode(true);
    };

    // stands in for the user withdrawing from the legacy vester
    const releasePair = async (pair) => {
      await gmxVester.setPairAmount(user0.address, 0);
      await gmxVester.approveToken(feeGmxTracker.address, user0.address, pair);
      await feeGmxTracker.connect(user0).transferFrom(gmxVester.address, user0.address, pair);
    };

    it("returns the pair when the cap trim would consume it", async () => {
      await router.setMaxBoostBasisPoints(10000);
      await setupAccount({
        base: expandDecimals(100, 18),
        oldBonus: expandDecimals(50, 18),
        extendedBonus: expandDecimals(1000, 18),
        pair: expandDecimals(400, 18),
      });

      await router.connect(user0).compound();

      expect(await feeGmxTracker.balanceOf(gmxVester.address)).eq(expandDecimals(400, 18));
      expect(await feeGmxTracker.depositBalances(user0.address, bonusGmxTracker.address)).eq(0);
      expect(await feeGmxTracker.depositBalances(user0.address, bnGmx.address)).eq(0);
      // the trim stops at the free receipts, the rest stays staked while the pair is held
      expect(await extendedGmxTracker.depositBalances(user0.address, bnGmx.address)).eq(expandDecimals(300, 18));
      expect(await feeGmxTracker.depositBalances(user0.address, extendedGmxTracker.address)).eq(
        expandDecimals(400, 18)
      );
      expect(await feeGmxTracker.stakedAmounts(user0.address)).eq(expandDecimals(400, 18));
      expect(await feeGmxTracker.balanceOf(user0.address)).eq(0);

      await router.connect(user0).compound();
      expect(await extendedGmxTracker.depositBalances(user0.address, bnGmx.address)).eq(expandDecimals(300, 18));

      await releasePair(expandDecimals(400, 18));
      await router.connect(user0).compound();
      expect(await extendedGmxTracker.depositBalances(user0.address, bnGmx.address)).eq(expandDecimals(100, 18));
      expect(await feeGmxTracker.stakedAmounts(user0.address)).eq(expandDecimals(200, 18));
      expect(await feeGmxTracker.balanceOf(user0.address)).eq(expandDecimals(200, 18));
    });

    it("returns a pair larger than the base stake under a zero cap", async () => {
      await setupAccount({
        base: expandDecimals(100, 18),
        oldBonus: expandDecimals(50, 18),
        extendedBonus: expandDecimals(0, 18),
        pair: expandDecimals(120, 18),
      });

      await router.connect(user0).compound();

      expect(await feeGmxTracker.balanceOf(gmxVester.address)).eq(expandDecimals(120, 18));
      expect(await feeGmxTracker.depositBalances(user0.address, bonusGmxTracker.address)).eq(0);
      expect(await feeGmxTracker.depositBalances(user0.address, bnGmx.address)).eq(0);
      expect(await extendedGmxTracker.depositBalances(user0.address, bnGmx.address)).eq(expandDecimals(20, 18));
      expect(await feeGmxTracker.stakedAmounts(user0.address)).eq(expandDecimals(120, 18));
      expect(await feeGmxTracker.balanceOf(user0.address)).eq(0);

      await releasePair(expandDecimals(120, 18));
      await router.connect(user0).compound();
      expect(await extendedGmxTracker.depositBalances(user0.address, bnGmx.address)).eq(0);
      expect(await feeGmxTracker.stakedAmounts(user0.address)).eq(expandDecimals(100, 18));
    });

    it("converts an old layout with a pair above the base stake when the cap has room", async () => {
      await router.setMaxBoostBasisPoints(10000);
      await setupAccount({
        base: expandDecimals(100, 18),
        oldBonus: expandDecimals(50, 18),
        extendedBonus: expandDecimals(0, 18),
        pair: expandDecimals(120, 18),
      });

      await router.connect(user0).compound();

      expect(await feeGmxTracker.balanceOf(gmxVester.address)).eq(expandDecimals(120, 18));
      expect(await feeGmxTracker.depositBalances(user0.address, bonusGmxTracker.address)).eq(0);
      expect(await feeGmxTracker.depositBalances(user0.address, bnGmx.address)).eq(0);
      expect(await extendedGmxTracker.depositBalances(user0.address, bnGmx.address)).eq(expandDecimals(50, 18));
      expect(await feeGmxTracker.stakedAmounts(user0.address)).eq(expandDecimals(150, 18));
      expect(await feeGmxTracker.balanceOf(user0.address)).eq(expandDecimals(30, 18));
    });
  });

  it("compound unstakes excess staked bnGmx even with zero unstaked balance", async () => {
    await stakeGmxFor(user0, expandDecimals(10, 18));

    await extendedGmxTracker.stakeForAccount(user0.address, user0.address, bnGmx.address, expandDecimals(3, 18));
    await feeGmxTracker.stakeForAccount(
      user0.address,
      user0.address,
      extendedGmxTracker.address,
      expandDecimals(3, 18)
    );
    expect(await bnGmx.balanceOf(user0.address)).eq(0);

    await router.connect(user0).compound();

    expect(await extendedGmxTracker.depositBalances(user0.address, bnGmx.address)).eq(0);
    expect(await feeGmxTracker.depositBalances(user0.address, extendedGmxTracker.address)).eq(expandDecimals(10, 18));
  });

  it("skips a zero proportional bnGmx reduction and clears the remainder on full exit", async () => {
    const amount = expandDecimals(100, 18);

    for (const account of [user0, user1]) {
      await stakeGmxFor(account, amount);
      await esGmx.mint(account.address, amount);
      await router.connect(account).stakeEsGmx(amount);

      await bnGmx.mint(account.address, 1);
      await extendedGmxTracker.stakeForAccount(account.address, account.address, bnGmx.address, 1);
      await feeGmxTracker.stakeForAccount(account.address, account.address, extendedGmxTracker.address, 1);
    }

    const delay = (await router.unstakeDelay()).toNumber();
    await router.connect(user0).signalUnstake(amount.mul(2));
    await router.connect(user1).signalUnstake(amount.mul(2));
    await time.increase(delay);

    await router.connect(user0).unstakeGmx(amount);
    await router.connect(user1).unstakeEsGmx(amount);

    for (const account of [user0, user1]) {
      expect(await stakedGmxTracker.stakedAmounts(account.address)).eq(amount);
      expect(await extendedGmxTracker.depositBalances(account.address, bnGmx.address)).eq(1);
    }

    await router.connect(user0).unstakeEsGmx(amount);
    await router.connect(user1).unstakeGmx(amount);

    for (const account of [user0, user1]) {
      expect(await stakedGmxTracker.stakedAmounts(account.address)).eq(0);
      expect(await extendedGmxTracker.depositBalances(account.address, bnGmx.address)).eq(0);
      expect(await bnGmx.balanceOf(account.address)).eq(0);
    }
  });

  it("an issuer claims pause does not block transfers for senders with nothing pending", async () => {
    await stakeGmxFor(user0, expandDecimals(10, 18));
    await dataStore.setBool(keys.incentiveIssuerClaimFeatureDisabledKey(issuer.address), true);

    await router.connect(user0).signalTransfer(user1.address);
    await router.connect(user1).acceptTransfer(user0.address);
    expect(await feeGmxTracker.stakedAmounts(user1.address)).eq(expandDecimals(10, 18));
  });

  it("handleRewards skips vesters with the claim feature disabled or a frozen account", async () => {
    await stakeGmxFor(user0, expandDecimals(10, 18));

    await dataStore.setBool(keys.incentiveVesterClaimFeatureDisabledKey(season.address), true);
    await dataStore.setBool(keys.incentiveVesterClaimFeatureDisabledKey(orphan.address), true);
    await router.connect(user0).handleRewards(true, false, false, false, false, false, false);

    await dataStore.setBool(keys.incentiveVesterClaimFeatureDisabledKey(season.address), false);
    await dataStore.setBool(keys.incentiveVesterClaimFeatureDisabledKey(orphan.address), false);
    await season.connect(guardian).setAccountFrozen(user0.address, true);
    await router.connect(user0).handleRewards(true, false, false, false, false, false, false);
  });

  it("acceptTransfer claims each designated vester's own issuer, not the router slot", async () => {
    await router.setEsGmxIssuer(AddressZero);
    await issueTo(user0, expandDecimals(200, 18));
    await stakeGmxFor(user0, expandDecimals(10, 18));

    await router.connect(user0).signalTransfer(user1.address);
    await router.connect(user1).acceptTransfer(user0.address);
    expect(await esGmx.balanceOf(user1.address)).eq(expandDecimals(200, 18));
    expect(await issuer.claimable(user0.address)).eq(0);
  });

  it("the boost cap, strict transfer mode and voting power type are set at construction", async () => {
    expect(await router.maxBoostBasisPoints()).eq(0);
    expect(await router.inStrictTransferMode()).eq(false);
    expect(await router.votingPowerType()).eq(0);

    const configured = await routerFactory.deploy({
      ...routerParams(),
      maxBoostBasisPoints: 5000,
      inStrictTransferMode: true,
      votingPowerType: 2,
    });
    expect(await configured.maxBoostBasisPoints()).eq(5000);
    expect(await configured.inStrictTransferMode()).eq(true);
    expect(await configured.votingPowerType()).eq(2);
  });

  it("a router deployed with a voting power type syncs votes without a later config call", async () => {
    const govToken = await (await ethers.getContractFactory("MintableToken")).deploy("GMX DAO", "GMX_DAO", 18);
    const votingRouter = await routerFactory.deploy({
      ...routerParams(),
      govToken: govToken.address,
      votingPowerType: 1,
    });
    await grantRole(roleStore, votingRouter.address, "CONTROLLER");

    // votes minted for an existing stake by the router this one replaces
    await stakeGmxFor(user0, expandDecimals(100, 18));
    await govToken.mint(user0.address, expandDecimals(100, 18));

    await votingRouter.connect(user0).signalUnstake(expandDecimals(100, 18));
    await time.increase((await votingRouter.unstakeDelay()).toNumber());

    await votingRouter.connect(user0).unstakeGmx(expandDecimals(40, 18));
    expect(await govToken.balanceOf(user0.address)).eq(expandDecimals(60, 18));
    await votingRouter.connect(user0).unstakeGmx(expandDecimals(60, 18));
    expect(await govToken.balanceOf(user0.address)).eq(0);

    await gmx.mint(user1.address, expandDecimals(10, 18));
    await votingRouter.connect(user1).stakeGmx(expandDecimals(10, 18));
    expect(await govToken.balanceOf(user1.address)).eq(expandDecimals(10, 18));
  });

  describe("unstake timelock", () => {
    const amount = expandDecimals(100, 18);
    let delay;

    const signalKey = async (account, value) => {
      const tx = await router.connect(account).signalUnstake(value);
      const signalled = getEventData(parseLogs(fixture, await tx.wait()), "RewardRouterUnstakeSignalled");
      return signalled.requestKey;
    };

    const requestByKey = async (key) => {
      const request = await router.getUnstakeRequest(key);
      return { amount: request.amount, requestedAt: request.requestedAt };
    };

    const timestampOf = async (tx) => {
      return (await ethers.provider.getBlock(tx.blockNumber)).timestamp;
    };

    beforeEach(async () => {
      delay = (await router.unstakeDelay()).toNumber();
    });

    it("launches with a 90 day delay, a 100 year expiry, and a 365 day cap", async () => {
      expect(delay).eq(90 * 24 * 60 * 60);
      expect(await router.unstakeExpiry()).eq(100 * 365 * 24 * 60 * 60);
      expect(await router.MAX_UNSTAKE_DELAY()).eq(365 * 24 * 60 * 60);
      expect(await router.MAX_UNSTAKE_REQUESTS()).eq(5);
      expect(await router.INITIAL_UNSTAKE_DELAY()).eq(delay);
    });

    it("rejects an unstake that was not signalled, for both GMX and esGMX", async () => {
      await stakeGmxFor(user0, amount);
      await router.connect(user0).stakeEsGmx(amount);

      await expect(router.connect(user0).unstakeGmx(amount)).to.be.revertedWithCustomError(
        errorsContract,
        "UnstakeNotSignalled"
      );
      await expect(router.connect(user0).unstakeEsGmx(amount)).to.be.revertedWithCustomError(
        errorsContract,
        "UnstakeNotSignalled"
      );
      expect(await stakedGmxTracker.stakedAmounts(user0.address)).eq(amount.mul(2));
    });

    it("uses the same delay for a small request and a large one", async () => {
      await stakeGmxFor(user0, amount);
      const small = expandDecimals(1, 18);

      const first = await router.connect(user0).signalUnstake(small);
      const firstAt = await timestampOf(first);
      const second = await router.connect(user0).signalUnstake(amount.sub(small));
      const secondAt = await timestampOf(second);
      expect(secondAt).to.be.gt(firstAt);

      await time.setNextBlockTimestamp(firstAt + delay - 1);
      await expect(router.connect(user0).unstakeGmx(small)).to.be.revertedWithCustomError(
        errorsContract,
        "UnstakeNotSignalled"
      );

      await time.setNextBlockTimestamp(firstAt + delay);
      await router.connect(user0).unstakeGmx(small);
      expect(await router.executableUnstakeAmount(user0.address)).eq(0);

      await time.setNextBlockTimestamp(secondAt + delay);
      await router.connect(user0).unstakeGmx(amount.sub(small));
      expect(await stakedGmxTracker.depositBalances(user0.address, gmx.address)).eq(0);
    });

    it("keeps the staked position and its on-chain rewards through the waiting period", async () => {
      await stakeGmxFor(user0, amount);
      await stakedGmxTracker.setClaimable(user0.address, expandDecimals(5, 18));

      const tx = await router.connect(user0).signalUnstake(amount);
      const signalled = getEventData(parseLogs(fixture, await tx.wait()), "RewardRouterUnstakeSignalled");
      expect(signalled.account).eq(user0.address);
      expect(signalled.amount).eq(amount);
      expect(await stakedGmxTracker.stakedAmounts(user0.address)).eq(amount);
      expect(await router.executableUnstakeAmount(user0.address)).eq(0);

      await time.increase(delay - 1);
      await router.connect(user0).claimEsGmx();
      expect(await esGmx.balanceOf(user0.address)).eq(expandDecimals(5, 18));
      expect(await stakedGmxTracker.stakedAmounts(user0.address)).eq(amount);

      await stakeGmxFor(user0, expandDecimals(1, 18));
      expect(await stakedGmxTracker.stakedAmounts(user0.address)).eq(amount.add(expandDecimals(1, 18)));
    });

    it("lets a matured request be unstaked once, including a partial unstake", async () => {
      await stakeGmxFor(user0, amount);
      await router.connect(user0).stakeEsGmx(amount);
      const key = await signalKey(user0, amount);
      await time.increase(delay);

      await router.connect(user0).unstakeGmx(amount.div(2));
      expect(await router.unstakeRequestsLength(user0.address)).eq(1);
      expect(await router.executableUnstakeAmount(user0.address)).eq(amount.div(2));
      expect((await requestByKey(key)).amount).eq(amount.div(2));
      expect((await requestByKey(key)).requestedAt).to.be.gt(0);

      await router.connect(user0).unstakeEsGmx(amount.div(2));
      expect(await router.unstakeRequestsLength(user0.address)).eq(0);
      expect(await router.executableUnstakeAmount(user0.address)).eq(0);

      await expect(router.connect(user0).unstakeGmx(1)).to.be.revertedWithCustomError(
        errorsContract,
        "UnstakeNotSignalled"
      );
      expect(await stakedGmxTracker.depositBalances(user0.address, gmx.address)).eq(amount.div(2));
      expect(await stakedGmxTracker.depositBalances(user0.address, esGmx.address)).eq(amount.div(2));
    });

    it("caps pending requests at the staked amount and at five slots", async () => {
      await stakeGmxFor(user0, amount);

      const firstKey = await signalKey(user0, amount.div(2));
      await router.connect(user0).signalUnstake(amount.div(2));
      await expect(router.connect(user0).signalUnstake(1)).to.be.revertedWithCustomError(
        errorsContract,
        "UnstakeAmountExceedsStake"
      );

      await stakeGmxFor(user0, expandDecimals(5, 18));
      for (let i = 0; i < 3; i++) {
        await router.connect(user0).signalUnstake(expandDecimals(1, 18));
      }
      expect(await router.unstakeRequestsLength(user0.address)).eq(5);
      await expect(router.connect(user0).signalUnstake(1)).to.be.revertedWithCustomError(
        errorsContract,
        "MaxUnstakeRequestsExceeded"
      );

      await time.increase(delay);
      await expect(router.connect(user0).signalUnstake(1)).to.be.revertedWithCustomError(
        errorsContract,
        "MaxUnstakeRequestsExceeded"
      );

      await router.connect(user0).cancelUnstake(firstKey);
      expect(await router.unstakeRequestsLength(user0.address)).eq(4);
      await router.connect(user0).signalUnstake(1);
      expect(await router.unstakeRequestsLength(user0.address)).eq(5);
    });

    it("drops a cancelled request from the executable amount", async () => {
      await stakeGmxFor(user0, amount);
      const key = await signalKey(user0, amount);
      const requestedAt = (await requestByKey(key)).requestedAt;

      await router.connect(user1).cancelUnstake(key);
      expect((await requestByKey(key)).amount).eq(amount);
      expect(await router.unstakeRequestKeys(user0.address)).deep.eq([key]);

      const cancelTx = await router.connect(user0).cancelUnstake(key);
      const cancelled = getEventData(parseLogs(fixture, await cancelTx.wait()), "RewardRouterUnstakeCancelled");
      expect(cancelled.amount).eq(amount);
      expect(cancelled.requestedAt).eq(requestedAt);
      expect(cancelled.requestKey).eq(key);
      expect(await router.pendingUnstakeAmount(user0.address)).eq(0);

      const again = await router.connect(user0).cancelUnstake(key);
      expect(getEventData(parseLogs(fixture, await again.wait()), "RewardRouterUnstakeCancelled")).eq(undefined);
      await router.connect(user1).cancelUnstake(key);
      await router.connect(user0).cancelUnstake(ethers.utils.hexlify(ethers.utils.randomBytes(32)));

      await time.increase(delay);
      await expect(router.connect(user0).unstakeGmx(amount)).to.be.revertedWithCustomError(
        errorsContract,
        "UnstakeNotSignalled"
      );
    });

    it("expires a request when gov sets an expiry, and never expires when expiry is zero", async () => {
      await stakeGmxFor(user0, amount);
      await router.setUnstakeExpiry(delay + 10 * 24 * 60 * 60);
      const key = await signalKey(user0, amount);

      await time.increase(delay);
      await router.connect(user0).unstakeGmx(amount.div(2));

      await time.increase(10 * 24 * 60 * 60);
      await expect(router.connect(user0).unstakeGmx(amount.div(2))).to.be.revertedWithCustomError(
        errorsContract,
        "UnstakeNotSignalled"
      );
      expect(await router.unstakeRequestsLength(user0.address)).eq(1);
      await router.connect(user0).cancelUnstake(key);
      expect(await router.unstakeRequestsLength(user0.address)).eq(0);

      await router.setUnstakeExpiry(0);
      await router.connect(user0).signalUnstake(amount.div(2));
      await time.increase(200 * 365 * 24 * 60 * 60);
      await router.connect(user0).unstakeGmx(amount.div(2));
      expect(await stakedGmxTracker.depositBalances(user0.address, gmx.address)).eq(0);
    });

    it("lets only gov set the delay, within the cap, and applies a new delay to pending requests", async () => {
      await expect(router.connect(user0).setUnstakeDelay(delay))
        .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
        .withArgs(user0.address, "CONTROLLER");
      await expect(router.connect(user0).setUnstakeExpiry(0))
        .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
        .withArgs(user0.address, "CONTROLLER");
      await expect(router.setUnstakeDelay((await router.MAX_UNSTAKE_DELAY()).add(1))).to.be.revertedWithCustomError(
        errorsContract,
        "MaxUnstakeDelayExceeded"
      );
      await expect(router.setUnstakeExpiry(delay)).to.be.revertedWithCustomError(
        errorsContract,
        "UnstakeDelayExceedsExpiry"
      );

      await stakeGmxFor(user0, amount);
      const tx = await router.connect(user0).signalUnstake(amount);
      const requestedAt = await timestampOf(tx);

      await time.setNextBlockTimestamp(requestedAt + delay);
      await mine();
      expect(await router.executableUnstakeAmount(user0.address)).eq(amount);

      const longerDelay = 120 * 24 * 60 * 60;
      await router.setUnstakeDelay(longerDelay);
      expect(await router.executableUnstakeAmount(user0.address)).eq(0);
      await expect(router.connect(user0).unstakeGmx(amount)).to.be.revertedWithCustomError(
        errorsContract,
        "UnstakeNotSignalled"
      );

      await time.setNextBlockTimestamp(requestedAt + longerDelay);
      await router.connect(user0).unstakeGmx(amount);
      expect(await stakedGmxTracker.depositBalances(user0.address, gmx.address)).eq(0);
    });

    it("brings a waiting request forward when gov shortens the delay", async () => {
      await stakeGmxFor(user0, amount);
      const tx = await router.connect(user0).signalUnstake(amount);
      const requestedAt = await timestampOf(tx);
      const shorterDelay = 10 * 24 * 60 * 60;

      await time.setNextBlockTimestamp(requestedAt + shorterDelay - 1);
      await router.setUnstakeDelay(shorterDelay);
      expect(await router.executableUnstakeAmount(user0.address)).eq(0);

      await time.setNextBlockTimestamp(requestedAt + shorterDelay);
      await router.connect(user0).unstakeGmx(amount);
      expect(await stakedGmxTracker.depositBalances(user0.address, gmx.address)).eq(0);
    });

    it("carries pending requests across an account transfer with the time already elapsed", async () => {
      await stakeGmxFor(user0, amount);
      const tx = await router.connect(user0).signalUnstake(amount.div(2));
      const requestedAt = await timestampOf(tx);
      const key = getEventData(parseLogs(fixture, await tx.wait()), "RewardRouterUnstakeSignalled").requestKey;

      await time.increase(30 * 24 * 60 * 60);
      await router.connect(user0).signalTransfer(user1.address);
      const transferTx = await router.connect(user1).acceptTransfer(user0.address);
      const moved = getEventData(parseLogs(fixture, await transferTx.wait()), "RewardRouterUnstakeRequestsTransferred");
      expect(moved.count).eq(1);
      expect(moved.sender).eq(user0.address);
      expect(moved.receiver).eq(user1.address);

      expect(await router.unstakeRequestsLength(user0.address)).eq(0);
      expect((await requestByKey(key)).requestedAt).eq(requestedAt);
      expect(await router.unstakeRequestKeys(user1.address)).deep.eq([key]);
      expect(await stakedGmxTracker.depositBalances(user1.address, gmx.address)).eq(amount);

      await expect(router.connect(user1).unstakeGmx(amount.div(2))).to.be.revertedWithCustomError(
        errorsContract,
        "UnstakeNotSignalled"
      );
      await router.connect(user0).cancelUnstake(key);
      expect(await router.unstakeRequestKeys(user1.address)).deep.eq([key]);

      await time.setNextBlockTimestamp(requestedAt + delay);
      await router.connect(user1).unstakeGmx(amount.div(2));
      expect(await stakedGmxTracker.depositBalances(user1.address, gmx.address)).eq(amount.div(2));
      expect(await router.unstakeRequestsLength(user1.address)).eq(0);
    });

    it("refuses an account transfer that would leave the receiver with more than five requests", async () => {
      await stakeGmxFor(user0, amount);
      await stakeGmxFor(user1, amount);
      for (let i = 0; i < 3; i++) {
        await router.connect(user0).signalUnstake(expandDecimals(1, 18));
        await router.connect(user1).signalUnstake(expandDecimals(1, 18));
      }

      await router.connect(user0).signalTransfer(user1.address);
      await expect(router.connect(user1).acceptTransfer(user0.address)).to.be.revertedWithCustomError(
        errorsContract,
        "MaxUnstakeRequestsOnTransfer"
      );
      expect(await router.unstakeRequestsLength(user0.address)).eq(3);
      expect(await stakedGmxTracker.stakedAmounts(user0.address)).eq(amount);
    });

    it("blocks new signals when the feature flag is set and still executes a request already stored", async () => {
      await stakeGmxFor(user0, amount);
      const key = await signalKey(user0, amount);

      await dataStore.setBool(keys.signalUnstakeFeatureDisabledKey(router.address), true);
      await expect(router.connect(user0).signalUnstake(1)).to.be.revertedWithCustomError(
        errorsContract,
        "DisabledFeature"
      );

      await time.increase(delay);
      await router.connect(user0).unstakeGmx(amount);
      expect((await requestByKey(key)).requestedAt).eq(0);
      expect(await stakedGmxTracker.depositBalances(user0.address, gmx.address)).eq(0);
    });
  });
});
