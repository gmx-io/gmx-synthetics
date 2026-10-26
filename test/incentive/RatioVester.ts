import { expect } from "chai";
import { ethers } from "hardhat";
import { time, mine } from "@nomicfoundation/hardhat-network-helpers";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals } from "../../utils/math";
import { grantRole } from "../../utils/role";
import { errorsContract } from "../../utils/error";
import * as keys from "../../utils/keys";

const { AddressZero, MaxUint256 } = ethers.constants;

const secondsPerYear = 365 * 24 * 60 * 60;
const EPOCH_DURATION = 7 * 24 * 60 * 60;
const EPOCH_OFFSET = 24 * 60 * 60;
const PAIR_PRECISION = expandDecimals(1, 30);

describe("RatioVester", () => {
  let fixture;
  let wallet, user0, user1, user2, handler, guardian, distributor, incentiveAdmin;
  let roleStore, dataStore, eventEmitter;
  let esGmx, gmx, pair, issuer, vester;
  let batchIndex;

  const vesterParams = (overrides = {}) => ({
    roleStore: roleStore.address,
    dataStore: dataStore.address,
    eventEmitter: eventEmitter.address,
    name: "Vested GMX S1",
    symbol: "vGMX-S1",
    vestingDuration: secondsPerYear,
    esToken: esGmx.address,
    pairToken: pair.address,
    claimableToken: gmx.address,
    issuer: issuer.address,
    pairRatioFactor: PAIR_PRECISION.mul(5),
    isUncapped: false,
    ...overrides,
  });

  const alignToEpochStart = async () => {
    const block = await ethers.provider.getBlock("latest");
    const next = (Math.floor((block.timestamp + EPOCH_OFFSET) / EPOCH_DURATION) + 1) * EPOCH_DURATION - EPOCH_OFFSET;
    await time.increase(next - block.timestamp + 60);
    await mine();
  };

  const issueAndApprove = async (account, esAmount, pairAmount) => {
    batchIndex += 1;
    await issuer.connect(distributor).distributeEpoch(1, batchIndex, [account.address], [esAmount]);
    await issuer.connect(handler).claimForAccount(account.address);
    await esGmx.connect(account).approve(vester.address, esAmount);
    if (pairAmount != 0) {
      await pair.mint(account.address, pairAmount);
      await pair.connect(account).approve(vester.address, pairAmount);
    }
  };

  const deposit = async (account, amount, target = vester) => {
    return target.connect(handler).depositForAccount(account.address, amount);
  };

  const withdraw = async (account, target = vester) => {
    return target.connect(handler).withdrawForAccount(account.address);
  };

  const claim = async (account, target = vester) => {
    return target.connect(handler).claimForAccount(account.address);
  };

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ wallet, user0, user1, user2 } = fixture.accounts);
    handler = fixture.accounts.user5;
    guardian = fixture.accounts.user6;
    distributor = fixture.accounts.user7;
    incentiveAdmin = fixture.accounts.user8;
    ({ roleStore, dataStore, eventEmitter } = fixture.contracts);

    batchIndex = 0;

    esGmx = await (await ethers.getContractFactory("MockEsGmxV1")).deploy("esGMX", "esGMX", 18);
    gmx = await (await ethers.getContractFactory("MintableToken")).deploy("GMX", "GMX", 18);
    pair = await (await ethers.getContractFactory("MintableToken")).deploy("Pair", "Pair", 18);

    issuer = await (
      await ethers.getContractFactory("EsGmxIssuer")
    ).deploy(roleStore.address, dataStore.address, eventEmitter.address, esGmx.address);
    vester = await (await ethers.getContractFactory("RatioVester")).deploy(vesterParams());

    await grantRole(roleStore, issuer.address, "CONTROLLER");
    await grantRole(roleStore, vester.address, "CONTROLLER");
    await grantRole(roleStore, handler.address, "CONTROLLER");
    await grantRole(roleStore, wallet.address, "TIMELOCK_ADMIN");
    await grantRole(roleStore, wallet.address, "TIMELOCK_MULTISIG");
    await grantRole(roleStore, guardian.address, "INCENTIVE_GUARDIAN");
    await grantRole(roleStore, distributor.address, "INCENTIVE_DISTRIBUTOR");
    await grantRole(roleStore, incentiveAdmin.address, "INCENTIVE_ADMIN");

    await issuer.setVester(vester.address);
    await vester.confirmIssuerBinding();

    await esGmx.mint(issuer.address, expandDecimals(1000000, 18));
    await gmx.mint(vester.address, expandDecimals(1000000, 18));

    await alignToEpochStart();
  });

  it("exposes vesting actions only through controller methods", async () => {
    expect(() => vester.interface.getFunction("deposit(uint256)")).to.throw();
    expect(() => vester.interface.getFunction("withdraw()")).to.throw();
    expect(() => vester.interface.getFunction("claim()")).to.throw();

    await expect(vester.connect(user0).depositForAccount(user0.address, 1)).to.be.revertedWithCustomError(
      errorsContract,
      "Unauthorized"
    );
    await expect(vester.connect(user0).withdrawForAccount(user0.address)).to.be.revertedWithCustomError(
      errorsContract,
      "Unauthorized"
    );
    await expect(vester.connect(user0).claimForAccount(user0.address)).to.be.revertedWithCustomError(
      errorsContract,
      "Unauthorized"
    );
  });

  it("rejects an issuer combined with uncapped mode", async () => {
    await expect(
      (await ethers.getContractFactory("RatioVester")).deploy(vesterParams({ isUncapped: true }))
    ).to.be.revertedWithCustomError(errorsContract, "UncappedVesterHasIssuer");
    const lean = await (
      await ethers.getContractFactory("RatioVester")
    ).deploy(vesterParams({ issuer: AddressZero, isUncapped: true }));
    expect(await lean.isUncapped()).eq(true);
  });

  it("requires the confirmed issuer binding for deposits", async () => {
    const unbound = await (await ethers.getContractFactory("RatioVester")).deploy(vesterParams());
    await grantRole(roleStore, unbound.address, "CONTROLLER");
    await gmx.mint(unbound.address, expandDecimals(1000, 18));
    await issueAndApprove(user0, expandDecimals(100, 18), expandDecimals(500, 18));
    await esGmx.connect(user0).approve(unbound.address, expandDecimals(100, 18));
    await expect(deposit(user0, expandDecimals(100, 18), unbound)).to.be.revertedWithCustomError(
      errorsContract,
      "IncentiveIssuerBindingNotConfirmed"
    );
    await expect(unbound.confirmIssuerBinding()).to.be.revertedWithCustomError(
      errorsContract,
      "IncentiveIssuerNotBound"
    );
  });

  it("caps deposits at issuance and locks pair at the fixed ratio", async () => {
    await issueAndApprove(user0, expandDecimals(1000, 18), expandDecimals(5000, 18));

    await expect(deposit(user0, expandDecimals(1001, 18))).to.be.revertedWithCustomError(
      errorsContract,
      "VestingCapExceeded"
    );

    await deposit(user0, expandDecimals(1000, 18));
    expect(await vester.balances(user0.address)).eq(expandDecimals(1000, 18));
    expect(await vester.pairAmounts(user0.address)).eq(expandDecimals(5000, 18));
    expect(await pair.balanceOf(vester.address)).eq(expandDecimals(5000, 18));
    expect(await vester.getVestingCap(user0.address)).eq(expandDecimals(1000, 18));

    await expect(deposit(user0, expandDecimals(1, 18))).to.be.revertedWithCustomError(
      errorsContract,
      "VestingCapExceeded"
    );
  });

  it("term: a new grant after a year of history still takes the full duration", async () => {
    await issueAndApprove(user0, expandDecimals(100000, 18), expandDecimals(500000, 18));
    await deposit(user0, expandDecimals(100000, 18));

    await time.increase(366 * 24 * 60 * 60);
    await mine();
    await claim(user0);
    expect(await gmx.balanceOf(user0.address)).eq(expandDecimals(100000, 18));

    await issueAndApprove(user0, expandDecimals(1000, 18), 0);
    await deposit(user0, expandDecimals(1000, 18));

    await time.increase(5 * 24 * 60 * 60);
    await mine();

    const claimable = await vester.claimable(user0.address);
    expect(claimable).gt(expandDecimals(10, 18));
    expect(claimable).lt(expandDecimals(20, 18));
    expect(await vester.balances(user0.address)).gt(expandDecimals(980, 18));
  });

  it("merges deposits within one epoch into a single tranche anchored at the amount-weighted time", async () => {
    await alignToEpochStart();
    await issueAndApprove(user0, expandDecimals(600, 18), expandDecimals(3000, 18));

    await deposit(user0, expandDecimals(100, 18));
    const t0 = (await ethers.provider.getBlock("latest")).timestamp;
    await time.increase(2 * 24 * 60 * 60);
    await mine();
    await deposit(user0, expandDecimals(200, 18));
    const t1 = (await ethers.provider.getBlock("latest")).timestamp;
    expect(await vester.tranchesLength(user0.address)).eq(1);

    const tranche = await vester.tranches(user0.address, 0);
    expect(tranche.totalAmount).eq(expandDecimals(300, 18));
    expect(tranche.startTime).eq(
      ethers.BigNumber.from(t0).mul(100).add(ethers.BigNumber.from(t1).mul(200)).add(299).div(300)
    );

    await time.increase(7 * 24 * 60 * 60);
    await mine();
    await deposit(user0, expandDecimals(300, 18));
    expect(await vester.tranchesLength(user0.address)).eq(2);
  });

  it("a deposit merged late in the epoch earns no credit from the epoch's earlier deposit", async () => {
    await alignToEpochStart();
    const amount = expandDecimals(1000, 18);
    await issueAndApprove(user0, amount.add(1), expandDecimals(5000, 18).add(5));

    await deposit(user0, 1);
    const epoch = await vester.currentEpoch();
    await time.increase(EPOCH_DURATION - 2 * 60 * 60);
    await mine();
    expect(await vester.currentEpoch()).eq(epoch);

    await deposit(user0, amount);
    const merged = (await ethers.provider.getBlock("latest")).timestamp;
    expect(await vester.tranchesLength(user0.address)).eq(1);

    await mine();
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const claimable = await vester.claimable(user0.address);
    expect(claimable).lte(
      amount
        .add(1)
        .mul(now - merged)
        .div(secondsPerYear)
    );
    expect(claimable).lt(expandDecimals(1, 15));

    await withdraw(user0);
    expect(await vester.claimable(user0.address)).lt(expandDecimals(1, 15));
    expect(await esGmx.balanceOf(user0.address)).gt(amount.sub(expandDecimals(1, 15)));
    expect(await pair.balanceOf(user0.address)).eq(expandDecimals(5000, 18).add(5));
  });

  it("a merged tranche converts what two separate tranches would", async () => {
    await alignToEpochStart();
    await issueAndApprove(user0, expandDecimals(300, 18), expandDecimals(1500, 18));

    await deposit(user0, expandDecimals(100, 18));
    const t0 = (await ethers.provider.getBlock("latest")).timestamp;
    await time.increase(3 * 24 * 60 * 60);
    await mine();
    await deposit(user0, expandDecimals(200, 18));
    const t1 = (await ethers.provider.getBlock("latest")).timestamp;
    expect(await vester.tranchesLength(user0.address)).eq(1);

    for (const days of [1, 30, 200]) {
      await time.increase(days * 24 * 60 * 60);
      await mine();
      const t = (await ethers.provider.getBlock("latest")).timestamp;
      const separate = expandDecimals(100, 18)
        .mul(t - t0)
        .div(secondsPerYear)
        .add(
          expandDecimals(200, 18)
            .mul(t - t1)
            .div(secondsPerYear)
        );
      const merged = await vester.claimable(user0.address);
      expect(merged).lte(separate);
      expect(separate.sub(merged)).lte(expandDecimals(300, 18).div(secondsPerYear));
    }
  });

  it("collateral: no refund mid-session, full return at withdrawal, converted stays claimable", async () => {
    await issueAndApprove(user0, expandDecimals(1000, 18), expandDecimals(5000, 18));
    await deposit(user0, expandDecimals(1000, 18));

    await time.increase(100 * 24 * 60 * 60);
    await mine();
    await vester.connect(user0).settleTranches(user0.address, 100);
    expect(await vester.pairAmounts(user0.address)).eq(expandDecimals(5000, 18));

    const esBefore = await esGmx.balanceOf(user0.address);
    await withdraw(user0);

    expect(await pair.balanceOf(user0.address)).eq(expandDecimals(5000, 18));
    const esReturned = (await esGmx.balanceOf(user0.address)).sub(esBefore);
    expect(esReturned).gt(expandDecimals(720, 18));
    expect(esReturned).lt(expandDecimals(727, 18));

    const unpaid = await vester.unpaidClaimAmounts(user0.address);
    expect(unpaid).gt(expandDecimals(273, 18));
    expect(unpaid).lt(expandDecimals(280, 18));

    await claim(user0);
    expect(await gmx.balanceOf(user0.address)).eq(unpaid);
    expect(await vester.unpaidClaimAmounts(user0.address)).eq(0);
  });

  it("counter separation: a closed session's unpaid amount never underflows the next", async () => {
    await issueAndApprove(user0, expandDecimals(300, 18), expandDecimals(1500, 18));
    await deposit(user0, expandDecimals(100, 18));

    await time.increase(366 * 24 * 60 * 60);
    await mine();
    await claim(user0);
    expect(await gmx.balanceOf(user0.address)).eq(expandDecimals(100, 18));

    await withdraw(user0);
    expect(await pair.balanceOf(user0.address)).eq(expandDecimals(1500, 18));

    await pair.connect(user0).approve(vester.address, expandDecimals(1500, 18));
    await deposit(user0, expandDecimals(50, 18));
    await time.increase(10 * 24 * 60 * 60);
    await mine();

    await withdraw(user0);
    const unpaid = await vester.unpaidClaimAmounts(user0.address);
    expect(unpaid).gt(0);
    await claim(user0);
    expect(await vester.unpaidClaimAmounts(user0.address)).eq(0);
  });

  it("conversion clamps to remaining headroom and resumes on unwind", async () => {
    await issueAndApprove(user0, expandDecimals(1000, 18), expandDecimals(5000, 18));
    await deposit(user0, expandDecimals(1000, 18));

    await vester.connect(guardian).increaseCapDeduction(user0.address, expandDecimals(900, 18));
    expect(await vester.getVestingCap(user0.address)).eq(expandDecimals(100, 18));

    await time.increase(100 * 24 * 60 * 60);
    await mine();
    await vester.connect(user0).settleTranches(user0.address, 100);

    expect(await vester.totalConvertedAmounts(user0.address)).eq(expandDecimals(100, 18));

    await vester.decreaseCapDeduction(user0.address, expandDecimals(900, 18));
    await vester.connect(user0).settleTranches(user0.address, 100);
    const converted = await vester.totalConvertedAmounts(user0.address);
    expect(converted).gt(expandDecimals(270, 18));
    expect(converted).lt(expandDecimals(280, 18));
  });

  it("conservation: deduct below converted, transfer, unwind, no headroom reappears", async () => {
    await issueAndApprove(user0, expandDecimals(100, 18), expandDecimals(500, 18));
    await deposit(user0, expandDecimals(100, 18));
    await time.increase(300 * 24 * 60 * 60);
    await mine();
    await claim(user0);
    await withdraw(user0);

    const used = await vester.totalConvertedAmounts(user0.address);
    expect(used).gt(expandDecimals(80, 18));

    await vester.connect(guardian).increaseCapDeduction(user0.address, expandDecimals(30, 18));
    await vester.connect(incentiveAdmin).setProvisioningComplete();
    await vester.connect(handler).transferVestingState(user0.address, user1.address);

    expect(await vester.getVestingCap(user0.address)).eq(0);
    const receiverCap = await vester.transferredCaps(user1.address);
    const receiverUsed = await vester.totalConvertedAmounts(user1.address);
    expect(receiverCap).eq(receiverUsed);

    await vester.decreaseCapDeduction(user0.address, expandDecimals(30, 18));
    const senderCap = await vester.getVestingCap(user0.address);
    const senderUsed = await vester.totalConvertedAmounts(user0.address);
    // exact lineage conservation: sender headroom equals the pre-deduction headroom,
    // receiver headroom stays zero, so nothing regenerates and nothing is lost
    expect(senderCap.sub(senderUsed)).eq(expandDecimals(100, 18).sub(used));
    expect(await vester.getVestingCap(user1.address)).eq(receiverUsed);
  });

  it("issuance after a transfer stays vestable on the old address", async () => {
    await issueAndApprove(user0, expandDecimals(1000, 18), expandDecimals(5000, 18));
    await deposit(user0, expandDecimals(1000, 18));
    await time.increase(146 * 24 * 60 * 60);
    await mine();
    await claim(user0);
    await withdraw(user0);

    await vester.connect(incentiveAdmin).setProvisioningComplete();
    await vester.connect(handler).transferVestingState(user0.address, user1.address);
    expect(await vester.totalConvertedAmounts(user0.address)).eq(0);

    await issueAndApprove(user0, expandDecimals(300, 18), expandDecimals(1500, 18));
    await deposit(user0, expandDecimals(300, 18));
    expect(await vester.balances(user0.address)).eq(expandDecimals(300, 18));
  });

  it("an oversized cap deduction cannot brick settlement or withdrawal", async () => {
    await issueAndApprove(user0, expandDecimals(100, 18), expandDecimals(500, 18));
    await deposit(user0, expandDecimals(100, 18));
    await time.increase(30 * 24 * 60 * 60);
    await mine();
    await claim(user0);
    await withdraw(user0);
    await vester.connect(incentiveAdmin).setProvisioningComplete();
    await vester.connect(handler).transferVestingState(user0.address, user1.address);

    await issueAndApprove(user0, expandDecimals(50, 18), expandDecimals(250, 18));
    await deposit(user0, expandDecimals(50, 18));

    await vester.connect(guardian).increaseCapDeduction(user0.address, MaxUint256);
    expect(await vester.getVestingCap(user0.address)).eq(0);
    const esBefore = await esGmx.balanceOf(user0.address);
    await withdraw(user0);
    expect((await esGmx.balanceOf(user0.address)).sub(esBefore)).eq(expandDecimals(50, 18));
  });

  it("operates with esGMX in private transfer mode given the grants-table handlers", async () => {
    await esGmx.setInPrivateTransferMode(true);
    await esGmx.setHandler(issuer.address, true);
    await esGmx.setHandler(vester.address, true);

    await issueAndApprove(user0, expandDecimals(100, 18), expandDecimals(500, 18));
    await deposit(user0, expandDecimals(100, 18));

    await time.increase(100 * 24 * 60 * 60);
    await mine();
    await claim(user0);
    const claimed = await gmx.balanceOf(user0.address);
    expect(claimed).gt(expandDecimals(27, 18));
    expect(claimed).lt(expandDecimals(28, 18));

    await withdraw(user0);
    const esBalance = await esGmx.balanceOf(user0.address);
    expect(esBalance).gt(expandDecimals(72, 18));
    expect(esBalance).lt(expandDecimals(73, 18));

    await esGmx.setHandler(vester.address, false);
    await esGmx.connect(user0).approve(vester.address, expandDecimals(1, 18));
    await expect(deposit(user0, expandDecimals(1, 18))).to.be.revertedWith("BaseToken: msg.sender not whitelisted");
  });

  it("transfer guards: open session, freshness, feature flag, provisioning", async () => {
    await issueAndApprove(user0, expandDecimals(100, 18), expandDecimals(500, 18));
    await deposit(user0, expandDecimals(100, 18));

    await expect(
      vester.connect(user0).transferVestingState(user0.address, user1.address)
    ).to.be.revertedWithCustomError(errorsContract, "Unauthorized");
    await expect(
      vester.connect(handler).transferVestingState(user0.address, user1.address)
    ).to.be.revertedWithCustomError(errorsContract, "VesterProvisioningNotComplete");

    await expect(vester.validateTransfersOpen()).to.be.revertedWithCustomError(
      errorsContract,
      "VesterProvisioningNotComplete"
    );
    await vester.connect(incentiveAdmin).setProvisioningComplete();
    await vester.validateTransfersOpen();
    await expect(
      vester.connect(handler).transferVestingState(user0.address, user1.address)
    ).to.be.revertedWithCustomError(errorsContract, "VestingSenderHasOpenSession");

    await withdraw(user0);
    await claim(user0);

    await dataStore.setBool(keys.incentiveVesterTransferFeatureDisabledKey(vester.address), true);
    await expect(
      vester.connect(handler).transferVestingState(user0.address, user1.address)
    ).to.be.revertedWithCustomError(errorsContract, "DisabledFeature");
    await dataStore.setBool(keys.incentiveVesterTransferFeatureDisabledKey(vester.address), false);

    await vester.connect(handler).transferVestingState(user0.address, user1.address);

    await expect(
      vester.connect(handler).transferVestingState(user2.address, user1.address)
    ).to.be.revertedWithCustomError(errorsContract, "VestingReceiverNotFresh");

    expect(await vester.isFreshForTransfer(user2.address)).eq(true);
    await vester.connect(guardian).setAccountFrozen(user2.address, true);
    expect(await vester.isFreshForTransfer(user2.address)).eq(false);
  });

  it("deposit and claim feature flags gate the vester directly", async () => {
    await issueAndApprove(user0, expandDecimals(100, 18), expandDecimals(500, 18));

    await dataStore.setBool(keys.incentiveVesterDepositFeatureDisabledKey(vester.address), true);
    await expect(deposit(user0, expandDecimals(100, 18))).to.be.revertedWithCustomError(
      errorsContract,
      "DisabledFeature"
    );
    await dataStore.setBool(keys.incentiveVesterDepositFeatureDisabledKey(vester.address), false);
    await deposit(user0, expandDecimals(100, 18));

    await time.increase(30 * 24 * 60 * 60);
    await mine();

    await dataStore.setBool(keys.incentiveVesterClaimFeatureDisabledKey(vester.address), true);
    await expect(claim(user0)).to.be.revertedWithCustomError(errorsContract, "DisabledFeature");
    await dataStore.setBool(keys.incentiveVesterClaimFeatureDisabledKey(vester.address), false);
    await claim(user0);
    expect(await gmx.balanceOf(user0.address)).gt(0);
  });

  it("solvency: a deposit beyond backing reverts at the deposit", async () => {
    const lean = await (await ethers.getContractFactory("RatioVester")).deploy(vesterParams({ issuer: AddressZero }));
    await grantRole(roleStore, lean.address, "CONTROLLER");
    await lean.connect(incentiveAdmin).setProvisionCaps([user0.address], [expandDecimals(1000, 18)]);
    await gmx.mint(lean.address, expandDecimals(400, 18));

    await esGmx.mint(user0.address, expandDecimals(1000, 18));
    await esGmx.connect(user0).approve(lean.address, expandDecimals(1000, 18));
    await pair.mint(user0.address, expandDecimals(5000, 18));
    await pair.connect(user0).approve(lean.address, expandDecimals(5000, 18));

    await expect(deposit(user0, expandDecimals(500, 18), lean)).to.be.revertedWithCustomError(
      errorsContract,
      "InsufficientVesterBacking"
    );
    await deposit(user0, expandDecimals(400, 18), lean);
  });

  it("freeze halts conversion, claims and deposits, never withdrawal", async () => {
    await issueAndApprove(user0, expandDecimals(1000, 18), expandDecimals(5000, 18));
    await deposit(user0, expandDecimals(1000, 18));

    await vester.connect(guardian).setAccountFrozen(user0.address, true);
    await time.increase(100 * 24 * 60 * 60);
    await mine();

    expect(await vester.claimable(user0.address)).eq(0);
    await expect(claim(user0)).to.be.revertedWithCustomError(errorsContract, "VesterAccountFrozen");
    await issueAndApprove(user0, expandDecimals(100, 18), expandDecimals(500, 18));
    await expect(deposit(user0, expandDecimals(100, 18))).to.be.revertedWithCustomError(
      errorsContract,
      "VesterAccountFrozen"
    );

    await withdraw(user0);
    // the withdrawn 1000 plus the 100 the frozen deposit could not take
    expect(await esGmx.balanceOf(user0.address)).eq(expandDecimals(1100, 18));
    expect(await pair.balanceOf(user0.address)).eq(expandDecimals(5500, 18));
  });

  it("deactivation: notice, push-out only, vesting freezes while claims stay open", async () => {
    await expect(
      vester.setDeactivatedAt((await ethers.provider.getBlock("latest")).timestamp + 1000)
    ).to.be.revertedWithCustomError(errorsContract, "VesterDeactivationNoticeTooShort");

    await issueAndApprove(user0, expandDecimals(1000, 18), expandDecimals(5000, 18));
    await deposit(user0, expandDecimals(1000, 18));

    const now = (await ethers.provider.getBlock("latest")).timestamp;
    const deactivateAt = now + 10 * 24 * 60 * 60;
    await vester.setDeactivatedAt(deactivateAt);
    await expect(vester.setDeactivatedAt(deactivateAt - 1)).to.be.revertedWithCustomError(
      errorsContract,
      "VesterDeactivationNotExtended"
    );

    await time.increase(30 * 24 * 60 * 60);
    await mine();

    await expect(deposit(user0, expandDecimals(1, 18))).to.be.revertedWithCustomError(
      errorsContract,
      "VesterDeactivated"
    );
    await expect(vester.setDeactivatedAt(deactivateAt + 1000)).to.be.revertedWithCustomError(
      errorsContract,
      "VesterAlreadyDeactivated"
    );

    const claimable = await vester.claimable(user0.address);
    expect(claimable).gt(expandDecimals(26, 18));
    expect(claimable).lt(expandDecimals(29, 18));

    await claim(user0);
    await withdraw(user0);
    expect(await pair.balanceOf(user0.address)).eq(expandDecimals(5000, 18));
  });

  it("paginated settle walks a backlog to completion", async () => {
    await issueAndApprove(user0, expandDecimals(500, 18), expandDecimals(2500, 18));

    for (let i = 0; i < 5; i++) {
      await deposit(user0, expandDecimals(100, 18));
      await time.increase(7 * 24 * 60 * 60);
      await mine();
    }
    expect(await vester.tranchesLength(user0.address)).eq(5);

    await time.increase(366 * 24 * 60 * 60);
    await mine();

    await vester.connect(user1).settleTranches(user0.address, 2);
    expect(await vester.trancheStartIndex(user0.address)).eq(2);
    await vester.connect(user1).settleTranches(user0.address, 2);
    expect(await vester.trancheStartIndex(user0.address)).eq(4);
    await vester.connect(user1).settleTranches(user0.address, 2);
    expect(await vester.trancheStartIndex(user0.address)).eq(5);

    await claim(user0);
    expect(await gmx.balanceOf(user0.address)).eq(expandDecimals(500, 18));
  });

  it("withdrawToken never reaches collateral, in-flight esGMX, or GMX obligations", async () => {
    await issueAndApprove(user0, expandDecimals(1000, 18), expandDecimals(5000, 18));
    await deposit(user0, expandDecimals(1000, 18));

    await expect(vester.withdrawToken(pair.address, wallet.address, 1)).to.be.revertedWithCustomError(
      errorsContract,
      "IncentiveWithdrawalExceedsExcessBalance"
    );
    await expect(vester.withdrawToken(esGmx.address, wallet.address, 1)).to.be.revertedWithCustomError(
      errorsContract,
      "IncentiveWithdrawalExceedsExcessBalance"
    );

    const gmxBalance = await gmx.balanceOf(vester.address);
    const excess = gmxBalance.sub(expandDecimals(1000, 18));
    await expect(vester.withdrawToken(gmx.address, wallet.address, excess.add(1))).to.be.revertedWithCustomError(
      errorsContract,
      "IncentiveWithdrawalExceedsExcessBalance"
    );
    await vester.withdrawToken(gmx.address, wallet.address, excess);
  });
});
