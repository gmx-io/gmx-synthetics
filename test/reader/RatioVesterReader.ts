import { expect } from "chai";
import { ethers } from "hardhat";
import { time, mine } from "@nomicfoundation/hardhat-network-helpers";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals } from "../../utils/math";
import { grantRole } from "../../utils/role";

const secondsPerYear = 365 * 24 * 60 * 60;
const PAIR_PRECISION = expandDecimals(1, 30);

describe("RatioVesterReader", () => {
  let fixture;
  let wallet, user0, distributor;
  let roleStore, dataStore, eventEmitter;
  let esGmx, gmx, pair;
  let issuer, vester, reader;

  const issueAndDeposit = async (amount, batch) => {
    await issuer.connect(distributor).distributeEpoch(1, batch, [user0.address], [amount]);
    await issuer.claimForAccount(user0.address);
    await esGmx.connect(user0).approve(vester.address, amount);
    const pairAmount = amount.mul(5);
    await pair.mint(user0.address, pairAmount);
    await pair.connect(user0).approve(vester.address, pairAmount);
    await vester.depositForAccount(user0.address, amount);
  };

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ wallet, user0 } = fixture.accounts);
    distributor = fixture.accounts.user7;
    ({ roleStore, dataStore, eventEmitter } = fixture.contracts);

    esGmx = await (await ethers.getContractFactory("MockEsGmxV1")).deploy("esGMX", "esGMX", 18);
    gmx = await (await ethers.getContractFactory("MintableToken")).deploy("GMX", "GMX", 18);
    pair = await (await ethers.getContractFactory("MintableToken")).deploy("Pair", "Pair", 18);

    issuer = await (
      await ethers.getContractFactory("EsGmxIssuer")
    ).deploy(roleStore.address, dataStore.address, eventEmitter.address, esGmx.address);
    vester = await (
      await ethers.getContractFactory("RatioVester")
    ).deploy({
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
    });
    reader = await (await ethers.getContractFactory("RatioVesterReader")).deploy();

    await grantRole(roleStore, issuer.address, "CONTROLLER");
    await grantRole(roleStore, vester.address, "CONTROLLER");
    await grantRole(roleStore, wallet.address, "CONTROLLER");
    await grantRole(roleStore, wallet.address, "TIMELOCK_ADMIN");
    await grantRole(roleStore, distributor.address, "INCENTIVE_DISTRIBUTOR");

    await issuer.setVester(vester.address);
    await vester.confirmIssuerBinding();

    await esGmx.mint(issuer.address, expandDecimals(10000, 18));
    await gmx.mint(vester.address, expandDecimals(10000, 18));
  });

  it("returns the vesting summary per vester", async () => {
    await issueAndDeposit(expandDecimals(100, 18), 0);

    await time.increase(73 * 24 * 60 * 60);
    await mine();

    const info = await reader.getVestingInfo([vester.address], user0.address);
    expect(info.length).eq(12);
    expect(info[0]).eq(expandDecimals(100, 18));
    expect(info[1]).eq(expandDecimals(500, 18));
    expect(info[2]).gt(expandDecimals(19, 18));
    expect(info[2]).lt(expandDecimals(21, 18));
    expect(info[7]).eq(expandDecimals(100, 18));
    expect(info[8]).eq(1);
    expect(info[9]).eq(secondsPerYear);
    expect(info[10]).eq(0);
    expect(info[11]).eq(PAIR_PRECISION.mul(5));
  });

  it("returns live tranches and drops them after withdrawal", async () => {
    await issueAndDeposit(expandDecimals(100, 18), 0);
    await time.increase(8 * 24 * 60 * 60);
    await mine();
    await issueAndDeposit(expandDecimals(50, 18), 1);

    let result = await reader.getTranches(vester.address, user0.address);
    expect(result.startTimes.length).eq(2);
    expect(result.totalAmounts[0]).eq(expandDecimals(100, 18));
    expect(result.totalAmounts[1]).eq(expandDecimals(50, 18));
    expect(result.startTimes[1]).gt(result.startTimes[0]);

    await vester.withdrawForAccount(user0.address);
    result = await reader.getTranches(vester.address, user0.address);
    expect(result.startTimes.length).eq(0);
  });

  it("returns issuer info", async () => {
    await issuer.connect(distributor).distributeEpoch(1, 0, [user0.address], [expandDecimals(300, 18)]);

    let info = await reader.getIssuerInfo(issuer.address, user0.address);
    expect(info[0]).eq(expandDecimals(300, 18));
    expect(info[1]).eq(0);
    expect(info[2]).eq(expandDecimals(300, 18));
    expect(info[3]).eq(expandDecimals(300, 18));
    expect(info[4]).eq(0);

    await issuer.claimForAccount(user0.address);
    info = await reader.getIssuerInfo(issuer.address, user0.address);
    expect(info[1]).eq(expandDecimals(300, 18));
    expect(info[2]).eq(0);
    expect(info[4]).eq(expandDecimals(300, 18));
  });
});
