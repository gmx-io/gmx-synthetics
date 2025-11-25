import { expect } from "chai";

import { daysInSeconds, increaseBlockTimestamp } from "../../utils/contributorHandler";
import { deployFixture } from "../../utils/fixture";
import { expandDecimals } from "../../utils/math";
import { grantRole } from "../../utils/role";
import { errorsContract } from "../../utils/error";
import { CONTRIBUTOR_LAST_PAYMENT_AT } from "../../utils/keys";

describe("ContributorHandler", () => {
  let fixture;
  let wallet, user0, user1, user2, user3, user4, user5, user6, user7, user8;
  let dataStore, roleStore, contributorHandler, gmx, usdc, wnt;
  let maxGmxAmount,
    maxUsdcAmount,
    user0GmxAmount,
    user0UsdcAmount,
    user1GmxAmount,
    user1UsdcAmount,
    user2GmxAmount,
    user2UsdcAmount,
    user3GmxAmount,
    user3UsdcAmount,
    user4GmxAmount,
    user4UsdcAmount,
    user5GmxAmount,
    user5UsdcAmount;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ wallet, user0, user1, user2, user3, user4, user5, user6, user7, user8 } = fixture.accounts);
    ({ dataStore, roleStore, contributorHandler, gmx, usdc, wnt } = fixture.contracts);

    await grantRole(roleStore, wallet.address, "CONTRIBUTOR_KEEPER");
    await grantRole(roleStore, wallet.address, "CONTRIBUTOR_DISTRIBUTOR");

    await contributorHandler.addContributorAccount(user0.address);
    await contributorHandler.addContributorAccount(user1.address);
    await contributorHandler.addContributorAccount(user2.address);
    await contributorHandler.addContributorAccount(user3.address);
    await contributorHandler.addContributorAccount(user4.address);
    await contributorHandler.addContributorAccount(user5.address);

    await contributorHandler.addContributorToken(gmx.address);
    await contributorHandler.addContributorToken(usdc.address);

    await contributorHandler.setContributorFundingAccount(gmx.address, user6.address);
    await contributorHandler.setContributorFundingAccount(usdc.address, user7.address);

    await contributorHandler.setMinContributorPaymentInterval(daysInSeconds(28));

    maxGmxAmount = expandDecimals(10_000, 18);
    maxUsdcAmount = expandDecimals(100_000, 6);

    await contributorHandler.setMaxTotalContributorTokenAmount(
      [gmx.address, usdc.address],
      [maxGmxAmount, maxUsdcAmount]
    );

    user0GmxAmount = expandDecimals(100, 18);
    user0UsdcAmount = expandDecimals(10_000, 6);
    user1GmxAmount = expandDecimals(50, 18);
    user1UsdcAmount = expandDecimals(8_000, 6);
    user2GmxAmount = expandDecimals(30, 18);
    user2UsdcAmount = 0;
    user3GmxAmount = 0;
    user3UsdcAmount = expandDecimals(7_000, 6);
    user4GmxAmount = expandDecimals(1_000, 18);
    user4UsdcAmount = expandDecimals(50_000, 6);
    user5GmxAmount = expandDecimals(20, 18);
    user5UsdcAmount = expandDecimals(5_000, 6);

    await contributorHandler.setContributorAmount(
      user0.address,
      [gmx.address, usdc.address],
      [user0GmxAmount, user0UsdcAmount]
    );
    await contributorHandler.setContributorAmount(
      user1.address,
      [gmx.address, usdc.address],
      [user1GmxAmount, user1UsdcAmount]
    );
    await contributorHandler.setContributorAmount(user2.address, [gmx.address], [user2GmxAmount]);
    await contributorHandler.setContributorAmount(user3.address, [usdc.address], [user3UsdcAmount]);
    await contributorHandler.setContributorAmount(
      user4.address,
      [gmx.address, usdc.address],
      [user4GmxAmount, user4UsdcAmount]
    );
    await contributorHandler.setContributorAmount(
      user5.address,
      [gmx.address, usdc.address],
      [user5GmxAmount, user5UsdcAmount]
    );
  });

  it("functions with onlyContributorKeeper modifier can only be executed by CONTRIBUTOR_KEEPER", async function () {
    await expect(contributorHandler.connect(user8).addContributorAccount(wallet.address)).to.be.revertedWithCustomError(
      errorsContract,
      "Unauthorized",
      "CONTRIBUTOR_KEEPER"
    );

    await expect(
      contributorHandler.connect(user8).removeContributorAccount(user0.address)
    ).to.be.revertedWithCustomError(errorsContract, "Unauthorized", "CONTRIBUTOR_KEEPER");

    await expect(contributorHandler.connect(user8).addContributorToken(wnt.address)).to.be.revertedWithCustomError(
      errorsContract,
      "Unauthorized",
      "CONTRIBUTOR_KEEPER"
    );

    await expect(contributorHandler.connect(user8).removeContributorToken(usdc.address)).to.be.revertedWithCustomError(
      errorsContract,
      "Unauthorized",
      "CONTRIBUTOR_KEEPER"
    );

    await expect(
      contributorHandler.connect(user8).setContributorFundingAccount(usdc.address, wallet.address)
    ).to.be.revertedWithCustomError(errorsContract, "Unauthorized", "CONTRIBUTOR_KEEPER");

    await expect(
      contributorHandler
        .connect(user8)
        .setContributorAmount(
          user0.address,
          [gmx.address, usdc.address],
          [expandDecimals(50, 18), expandDecimals(5_000, 6)]
        )
    ).to.be.revertedWithCustomError(errorsContract, "Unauthorized", "CONTRIBUTOR_KEEPER");
  });

  it("functions with onlyController modifier can only be executed by CONTROLLER", async function () {
    await expect(
      contributorHandler.connect(user0).setMinContributorPaymentInterval(daysInSeconds(21))
    ).to.be.revertedWithCustomError(errorsContract, "Unauthorized", "CONTROLLER");

    await expect(
      contributorHandler
        .connect(user0)
        .setMaxTotalContributorTokenAmount(
          [gmx.address, usdc.address],
          [expandDecimals(20_000, 18), expandDecimals(200_000, 6)]
        )
    ).to.be.revertedWithCustomError(errorsContract, "Unauthorized", "CONTROLLER");
  });

  it("setMinContributorPaymentInterval(), setMaxTotalContributorTokenAmount() & setContributorAmount() errors", async function () {
    await expect(contributorHandler.setMinContributorPaymentInterval(daysInSeconds(19))).to.be.revertedWithCustomError(
      errorsContract,
      "MinContributorPaymentIntervalBelowAllowedRange",
      19
    );

    await expect(
      contributorHandler.setMaxTotalContributorTokenAmount(
        [gmx.address, usdc.address, wnt.address],
        [expandDecimals(20, 18), expandDecimals(20_000, 6)]
      )
    ).to.be.revertedWithCustomError(errorsContract, "InvalidSetMaxTotalContributorTokenAmountInput", 3, 2);

    await expect(
      contributorHandler.setMaxTotalContributorTokenAmount(
        [gmx.address, usdc.address],
        [maxGmxAmount, expandDecimals(70_000, 6)]
      )
    ).to.be.revertedWithCustomError(
      errorsContract,
      "MaxTotalContributorTokenAmountExceeded",
      usdc.address,
      80_000,
      70_000
    );

    await expect(
      contributorHandler.setContributorAmount(
        user0.address,
        [gmx.address, usdc.address],
        [expandDecimals(20, 18), expandDecimals(20_000, 6), expandDecimals(20_000, 18)]
      )
    ).to.be.revertedWithCustomError(errorsContract, "InvalidSetContributorPaymentInput", 2, 3);

    await expect(
      contributorHandler.setContributorAmount(
        user0.address,
        [wnt.address, usdc.address],
        [expandDecimals(20, 18), expandDecimals(20_000, 6)]
      )
    ).to.be.revertedWithCustomError(errorsContract, "InvalidContributorToken", wnt.address);

    await expect(
      contributorHandler.setContributorAmount(
        user0.address,
        [gmx.address, usdc.address],
        [expandDecimals(20, 18), expandDecimals(35_000, 6)]
      )
    ).to.be.revertedWithCustomError(
      errorsContract,
      "MaxTotalContributorTokenAmountExceeded",
      usdc.address,
      105_000,
      100_000
    );
  });

  it("sendPayments() can only be executed after min payment interval, funding account approvals and by CONTRIBUTOR_DISTRIBUTOR", async function () {
    const block = await ethers.provider.getBlock("latest");
    await dataStore.setUint(CONTRIBUTOR_LAST_PAYMENT_AT, block.timestamp);

    const minContributorPaymentInterval = daysInSeconds(28);

    await expect(contributorHandler.sendPayments()).to.be.revertedWithCustomError(
      errorsContract,
      "MinContributorPaymentIntervalNotYetPassed",
      minContributorPaymentInterval
    );

    await increaseBlockTimestamp(minContributorPaymentInterval);

    await expect(contributorHandler.sendPayments()).to.be.revertedWith("ERC20: insufficient allowance");

    await expect(contributorHandler.connect(user0).sendPayments()).to.be.revertedWithCustomError(
      errorsContract,
      "Unauthorized",
      "CONTRIBUTOR_DISTRIBUTOR"
    );
  });

  it("sendPayments() sends tokens to contributor addresses", async function () {
    await gmx.mint(user6.address, maxGmxAmount);
    await usdc.mint(user7.address, maxUsdcAmount);
    await gmx.connect(user6).approve(contributorHandler.address, maxGmxAmount);
    await usdc.connect(user7).approve(contributorHandler.address, maxUsdcAmount);

    expect(await gmx.balanceOf(user0.address)).to.equal(0);
    expect(await usdc.balanceOf(user0.address)).to.equal(0);
    expect(await gmx.balanceOf(user1.address)).to.equal(0);
    expect(await usdc.balanceOf(user1.address)).to.equal(0);
    expect(await gmx.balanceOf(user2.address)).to.equal(0);
    expect(await usdc.balanceOf(user2.address)).to.equal(0);
    expect(await gmx.balanceOf(user3.address)).to.equal(0);
    expect(await usdc.balanceOf(user3.address)).to.equal(0);
    expect(await gmx.balanceOf(user4.address)).to.equal(0);
    expect(await usdc.balanceOf(user4.address)).to.equal(0);
    expect(await gmx.balanceOf(user5.address)).to.equal(0);
    expect(await usdc.balanceOf(user5.address)).to.equal(0);

    const block = await ethers.provider.getBlock("latest");
    await dataStore.setUint(CONTRIBUTOR_LAST_PAYMENT_AT, block.timestamp);

    const minContributorPaymentInterval = daysInSeconds(28);

    await expect(contributorHandler.sendPayments()).to.be.revertedWithCustomError(
      errorsContract,
      "MinContributorPaymentIntervalNotYetPassed",
      minContributorPaymentInterval
    );

    await increaseBlockTimestamp(minContributorPaymentInterval);

    const tx = await contributorHandler.sendPayments();
    const txReceipt = await tx.wait();
    const receiptBlock = await ethers.provider.getBlock(txReceipt.blockNumber);

    expect(await dataStore.getUint(CONTRIBUTOR_LAST_PAYMENT_AT)).to.equal(receiptBlock.timestamp);
    expect(await gmx.balanceOf(user0.address)).to.equal(user0GmxAmount);
    expect(await usdc.balanceOf(user0.address)).to.equal(user0UsdcAmount);
    expect(await gmx.balanceOf(user1.address)).to.equal(user1GmxAmount);
    expect(await usdc.balanceOf(user1.address)).to.equal(user1UsdcAmount);
    expect(await gmx.balanceOf(user2.address)).to.equal(user2GmxAmount);
    expect(await usdc.balanceOf(user2.address)).to.equal(user2UsdcAmount);
    expect(await gmx.balanceOf(user3.address)).to.equal(user3GmxAmount);
    expect(await usdc.balanceOf(user3.address)).to.equal(user3UsdcAmount);
    expect(await gmx.balanceOf(user4.address)).to.equal(user4GmxAmount);
    expect(await usdc.balanceOf(user4.address)).to.equal(user4UsdcAmount);
    expect(await gmx.balanceOf(user5.address)).to.equal(user5GmxAmount);
    expect(await usdc.balanceOf(user5.address)).to.equal(user5UsdcAmount);
  });
});
