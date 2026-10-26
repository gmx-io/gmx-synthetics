import { expect } from "chai";
import { ethers } from "hardhat";

import { deployFixture } from "../../utils/fixture";
import { grantRole } from "../../utils/role";
import { errorsContract } from "../../utils/error";
import * as keys from "../../utils/keys";

const { AddressZero } = ethers.constants;

describe("EsGmxIssuer", () => {
  let fixture;
  let wallet, user0, user1, user2, distributor, incentiveAdmin;
  let roleStore, dataStore, eventEmitter;
  let esGmx, issuer;
  let sorted;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ wallet, user0, user1, user2 } = fixture.accounts);
    distributor = fixture.accounts.user7;
    incentiveAdmin = fixture.accounts.user8;
    ({ roleStore, dataStore, eventEmitter } = fixture.contracts);

    esGmx = await (await ethers.getContractFactory("MockEsGmxV1")).deploy("esGMX", "esGMX", 18);
    issuer = await (
      await ethers.getContractFactory("EsGmxIssuer")
    ).deploy(roleStore.address, dataStore.address, eventEmitter.address, esGmx.address);

    await grantRole(roleStore, issuer.address, "CONTROLLER");
    await grantRole(roleStore, wallet.address, "CONTROLLER");
    await grantRole(roleStore, wallet.address, "TIMELOCK_ADMIN");
    await grantRole(roleStore, wallet.address, "TIMELOCK_MULTISIG");
    await grantRole(roleStore, distributor.address, "INCENTIVE_DISTRIBUTOR");
    await grantRole(roleStore, incentiveAdmin.address, "INCENTIVE_ADMIN");

    sorted = [user0.address, user1.address, user2.address].sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1));
  });

  it("inits and gates roles", async () => {
    expect(await issuer.esGmx()).eq(esGmx.address);
    expect(await issuer.vester()).eq(AddressZero);
    expect(() => issuer.interface.getFunction("claim()")).to.throw();
    expect(() => issuer.interface.getFunction("claimAmount(uint256)")).to.throw();

    await expect(issuer.connect(user0).setVester(user1.address)).to.be.revertedWithCustomError(
      errorsContract,
      "Unauthorized"
    );
    await expect(issuer.connect(user0).withdrawToken(esGmx.address, user0.address, 1)).to.be.revertedWithCustomError(
      errorsContract,
      "Unauthorized"
    );
    await expect(issuer.connect(user0).distributeEpoch(1, 0, [sorted[0]], [100])).to.be.revertedWithCustomError(
      errorsContract,
      "Unauthorized"
    );
    await expect(issuer.connect(user0).finalizeEpoch(1, 0, 0)).to.be.revertedWithCustomError(
      errorsContract,
      "Unauthorized"
    );
    await expect(issuer.connect(user0).reduceIssuedAmount(user0.address, 1)).to.be.revertedWithCustomError(
      errorsContract,
      "Unauthorized"
    );
    await expect(issuer.connect(user0).claimForAccount(user1.address)).to.be.revertedWithCustomError(
      errorsContract,
      "Unauthorized"
    );
  });

  it("setVester is one-shot", async () => {
    await expect(issuer.setVester(AddressZero)).to.be.revertedWithCustomError(errorsContract, "EmptyIncentiveVester");
    await issuer.setVester(user1.address);
    expect(await issuer.vester()).eq(user1.address);
    await expect(issuer.setVester(user2.address)).to.be.revertedWithCustomError(
      errorsContract,
      "IncentiveVesterAlreadySet"
    );
  });

  it("distributeEpoch validates inputs and funding", async () => {
    await expect(issuer.connect(distributor).distributeEpoch(1, 0, [], [])).to.be.revertedWithCustomError(
      errorsContract,
      "EmptyIssuanceBatch"
    );
    await expect(
      issuer.connect(distributor).distributeEpoch(1, 0, [sorted[0]], [100, 200])
    ).to.be.revertedWithCustomError(errorsContract, "InvalidIssuanceBatchLengths");
    await expect(
      issuer.connect(distributor).distributeEpoch(1, 0, [sorted[1], sorted[0]], [100, 200])
    ).to.be.revertedWithCustomError(errorsContract, "IssuanceBatchNotSorted");
    await expect(
      issuer.connect(distributor).distributeEpoch(1, 0, [sorted[0], sorted[0]], [100, 200])
    ).to.be.revertedWithCustomError(errorsContract, "IssuanceBatchNotSorted");
    await expect(issuer.connect(distributor).distributeEpoch(1, 0, [AddressZero], [100])).to.be.revertedWithCustomError(
      errorsContract,
      "EmptyIssuanceAccount"
    );
    await expect(issuer.connect(distributor).distributeEpoch(1, 0, [sorted[0]], [0])).to.be.revertedWithCustomError(
      errorsContract,
      "EmptyIssuanceAmount"
    );

    await expect(issuer.connect(distributor).distributeEpoch(1, 0, [sorted[0]], [100])).to.be.revertedWithCustomError(
      errorsContract,
      "InsufficientIssuanceFunding"
    );

    await esGmx.mint(issuer.address, 1000);
    await issuer.connect(distributor).distributeEpoch(1, 0, [sorted[0], sorted[1]], [100, 200]);

    expect(await issuer.issuedAmounts(sorted[0])).eq(100);
    expect(await issuer.issuedAmounts(sorted[1])).eq(200);
    expect(await issuer.claimable(sorted[0])).eq(100);
    expect(await issuer.totalIssuedAmount()).eq(300);

    const epoch = await issuer.epochs(1);
    expect(epoch.finalized).eq(false);
    expect(epoch.entryCount).eq(2);
    expect(epoch.totalAmount).eq(300);

    await expect(issuer.connect(distributor).distributeEpoch(1, 1, [sorted[0]], [800])).to.be.revertedWithCustomError(
      errorsContract,
      "InsufficientIssuanceFunding"
    );
    await issuer.connect(distributor).distributeEpoch(1, 1, [sorted[0]], [700]);
    expect(await issuer.totalIssuedAmount()).eq(1000);
  });

  it("closes both replay shapes, scoped per epoch", async () => {
    await esGmx.mint(issuer.address, 1000);
    await issuer.connect(distributor).distributeEpoch(1, 0, [sorted[0]], [100]);

    await expect(issuer.connect(distributor).distributeEpoch(1, 0, [sorted[1]], [100])).to.be.revertedWithCustomError(
      errorsContract,
      "IssuanceBatchIndexAlreadyProcessed"
    );
    await expect(issuer.connect(distributor).distributeEpoch(1, 1, [sorted[0]], [100])).to.be.revertedWithCustomError(
      errorsContract,
      "IssuanceBatchContentAlreadyProcessed"
    );

    await issuer.connect(distributor).distributeEpoch(1, 1, [sorted[0]], [150]);
    await issuer.connect(distributor).distributeEpoch(2, 0, [sorted[0]], [100]);

    expect(await issuer.issuedAmounts(sorted[0])).eq(350);
  });

  it("finalizeEpoch reconciles and seals", async () => {
    await esGmx.mint(issuer.address, 1000);
    await issuer.connect(distributor).distributeEpoch(1, 0, [sorted[0], sorted[1]], [100, 200]);

    await expect(issuer.connect(incentiveAdmin).finalizeEpoch(1, 1, 300)).to.be.revertedWithCustomError(
      errorsContract,
      "IssuanceEpochEntryCountMismatch"
    );
    await expect(issuer.connect(incentiveAdmin).finalizeEpoch(1, 2, 299)).to.be.revertedWithCustomError(
      errorsContract,
      "IssuanceEpochTotalMismatch"
    );
    await expect(issuer.connect(incentiveAdmin).finalizeEpoch(2, 1, 100)).to.be.revertedWithCustomError(
      errorsContract,
      "IssuanceEpochEntryCountMismatch"
    );

    await issuer.connect(incentiveAdmin).finalizeEpoch(1, 2, 300);
    expect((await issuer.epochs(1)).finalized).eq(true);

    await expect(issuer.connect(incentiveAdmin).finalizeEpoch(1, 2, 300)).to.be.revertedWithCustomError(
      errorsContract,
      "IssuanceEpochFinalized"
    );
    await expect(issuer.connect(distributor).distributeEpoch(1, 2, [sorted[2]], [50])).to.be.revertedWithCustomError(
      errorsContract,
      "IssuanceEpochFinalized"
    );
  });

  it("claims pay the account in full, once", async () => {
    await esGmx.mint(issuer.address, 1000);
    await issuer.connect(distributor).distributeEpoch(1, 0, [user0.address], [400]);

    await issuer.claimForAccount(user0.address);
    expect(await esGmx.balanceOf(user0.address)).eq(400);
    expect(await issuer.claimable(user0.address)).eq(0);
    expect(await issuer.totalClaimedAmount()).eq(400);

    await issuer.claimForAccount(user0.address);
    expect(await esGmx.balanceOf(user0.address)).eq(400);

    await issuer.connect(distributor).distributeEpoch(1, 1, [user0.address], [100]);
    await expect(issuer.connect(user1).claimForAccount(user0.address)).to.be.revertedWithCustomError(
      errorsContract,
      "Unauthorized"
    );
    await grantRole(roleStore, user1.address, "CONTROLLER");
    await issuer.connect(user1).claimForAccount(user0.address);
    expect(await esGmx.balanceOf(user0.address)).eq(500);
    expect(await esGmx.balanceOf(user1.address)).eq(0);
  });

  it("claims by amount stay within the claimable balance", async () => {
    await esGmx.mint(issuer.address, 1000);
    await issuer.connect(distributor).distributeEpoch(1, 0, [user0.address], [400]);

    await expect(issuer.connect(user0).claimAmountForAccount(user0.address, 100)).to.be.revertedWithCustomError(
      errorsContract,
      "Unauthorized"
    );
    await issuer.claimAmountForAccount(user0.address, 150);
    expect(await esGmx.balanceOf(user0.address)).eq(150);
    expect(await issuer.claimable(user0.address)).eq(250);
    expect(await issuer.totalClaimedAmount()).eq(150);

    await expect(issuer.claimAmountForAccount(user0.address, 300)).to.be.revertedWithCustomError(
      errorsContract,
      "IssuerClaimExceedsClaimable"
    );
    await issuer.claimAmountForAccount(user0.address, 0);
    expect(await esGmx.balanceOf(user0.address)).eq(150);

    await issuer.claimForAccount(user0.address);
    expect(await esGmx.balanceOf(user0.address)).eq(400);
    expect(await issuer.claimable(user0.address)).eq(0);
  });

  it("claim feature flag blocks claims", async () => {
    await esGmx.mint(issuer.address, 1000);
    await issuer.connect(distributor).distributeEpoch(1, 0, [user0.address], [400]);

    await dataStore.setBool(keys.incentiveIssuerClaimFeatureDisabledKey(issuer.address), true);
    await expect(issuer.claimForAccount(user0.address)).to.be.revertedWithCustomError(
      errorsContract,
      "DisabledFeature"
    );

    await dataStore.setBool(keys.incentiveIssuerClaimFeatureDisabledKey(issuer.address), false);
    await issuer.claimForAccount(user0.address);
    expect(await esGmx.balanceOf(user0.address)).eq(400);
  });

  it("reduceIssuedAmount reaches only unclaimed amounts and applies what remains", async () => {
    await esGmx.mint(issuer.address, 1000);
    await issuer.connect(distributor).distributeEpoch(1, 0, [user0.address], [400]);

    await issuer.connect(incentiveAdmin).reduceIssuedAmount(user0.address, 150);
    expect(await issuer.issuedAmounts(user0.address)).eq(250);
    expect(await issuer.claimable(user0.address)).eq(250);
    expect(await issuer.totalIssuedAmount()).eq(250);

    await issuer.connect(incentiveAdmin).reduceIssuedAmount(user0.address, 300);
    expect(await issuer.issuedAmounts(user0.address)).eq(0);
    expect(await issuer.totalIssuedAmount()).eq(0);

    await issuer.connect(distributor).distributeEpoch(1, 1, [user0.address], [100]);
    await issuer.claimForAccount(user0.address);
    await expect(issuer.connect(incentiveAdmin).reduceIssuedAmount(user0.address, 1)).to.be.revertedWithCustomError(
      errorsContract,
      "EmptyIssuanceReduction"
    );
    await expect(issuer.connect(incentiveAdmin).reduceIssuedAmount(user0.address, 0)).to.be.revertedWithCustomError(
      errorsContract,
      "EmptyIssuanceReduction"
    );
  });

  it("withdrawToken reaches only esGMX above the outstanding ledger", async () => {
    await esGmx.mint(issuer.address, 1000);
    await issuer.connect(distributor).distributeEpoch(1, 0, [user0.address], [600]);

    await expect(issuer.withdrawToken(esGmx.address, wallet.address, 401)).to.be.revertedWithCustomError(
      errorsContract,
      "IncentiveWithdrawalExceedsExcessBalance"
    );
    await issuer.withdrawToken(esGmx.address, wallet.address, 400);
    expect(await esGmx.balanceOf(wallet.address)).eq(400);

    await issuer.claimForAccount(user0.address);
    expect(await esGmx.balanceOf(issuer.address)).eq(0);
    await expect(issuer.withdrawToken(esGmx.address, wallet.address, 1)).to.be.revertedWithCustomError(
      errorsContract,
      "IncentiveWithdrawalExceedsExcessBalance"
    );
  });

  it("claims need handler status once esGMX is in private transfer mode", async () => {
    await esGmx.mint(issuer.address, 1000);
    await issuer.connect(distributor).distributeEpoch(1, 0, [user0.address], [400]);

    await esGmx.setInPrivateTransferMode(true);
    await expect(issuer.claimForAccount(user0.address)).to.be.revertedWith("BaseToken: msg.sender not whitelisted");

    await esGmx.setHandler(issuer.address, true);
    await issuer.claimForAccount(user0.address);
    expect(await esGmx.balanceOf(user0.address)).eq(400);
  });
});
