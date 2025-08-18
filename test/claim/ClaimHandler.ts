import { expect } from "chai";
import { ethers } from "hardhat";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals } from "../../utils/math";
import { grantRole } from "../../utils/role";
import { errorsContract } from "../../utils/error";
import * as keys from "../../utils/keys";
import { getEventDataArray, parseLogs } from "../../utils/event";
import { encodeData } from "../../utils/hash";

describe("ClaimHandler", () => {
  let user0, user1, user2, wallet;
  let roleStore, dataStore, config, claimHandler, claimVault;
  let wnt, usdc;
  let fixture;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1, user2, wallet } = fixture.accounts);
    ({ roleStore, dataStore, config, wnt, usdc, claimHandler, claimVault } = fixture.contracts);

    await grantRole(roleStore, wallet.address, "CLAIM_ADMIN");
    await grantRole(roleStore, user0.address, "TIMELOCK_MULTISIG");

    await wnt.mint(wallet.address, expandDecimals(1000, 18));
    await usdc.mint(wallet.address, expandDecimals(1000000, 6));

    await wnt.connect(wallet).approve(claimHandler.address, expandDecimals(1000, 18));
    await usdc.connect(wallet).approve(claimHandler.address, expandDecimals(1000000, 6));
  });

  describe("depositFunds", () => {
    it("should handle deposits correctly - happy path", async () => {
      expect(await claimHandler.getClaimableAmount(user0.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getClaimableAmount(user1.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getClaimableAmount(user2.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getTotalClaimableAmount(wnt.address)).to.equal(0);

      const initialDepositorBalance = await wnt.balanceOf(wallet.address);
      const initialVaultBalance = await wnt.balanceOf(claimVault.address);
      expect(initialVaultBalance).to.equal(0);

      const firstDepositParams = [
        { account: user0.address, amount: expandDecimals(100, 18) },
        { account: user1.address, amount: expandDecimals(200, 18) },
        { account: user2.address, amount: expandDecimals(300, 18) },
      ];
      const firstDepositTotal = expandDecimals(600, 18);

      const tx = await claimHandler.connect(wallet).depositFunds(wnt.address, 1, firstDepositParams);
      const txReceipt = await hre.ethers.provider.getTransactionReceipt(tx.hash);
      const logs = parseLogs(fixture, txReceipt);
      const events = getEventDataArray(logs, "ClaimFundsDeposited");
      expect(events.length).to.equal(3);
      expect(events).to.deep.equal([
        {
          account: user0.address,
          amount: expandDecimals(100, 18),
          token: wnt.address,
          distributionId: 1,
          nextAmount: expandDecimals(100, 18),
        },
        {
          account: user1.address,
          amount: expandDecimals(200, 18),
          token: wnt.address,
          distributionId: 1,
          nextAmount: expandDecimals(200, 18),
        },
        {
          account: user2.address,
          amount: expandDecimals(300, 18),
          token: wnt.address,
          distributionId: 1,
          nextAmount: expandDecimals(300, 18),
        },
      ]);

      expect(await claimHandler.getClaimableAmount(user0.address, wnt.address, [1])).to.equal(expandDecimals(100, 18));
      expect(await claimHandler.getClaimableAmount(user1.address, wnt.address, [1])).to.equal(expandDecimals(200, 18));
      expect(await claimHandler.getClaimableAmount(user2.address, wnt.address, [1])).to.equal(expandDecimals(300, 18));
      expect(await claimHandler.getTotalClaimableAmount(wnt.address)).to.equal(firstDepositTotal);

      expect(await wnt.balanceOf(wallet.address)).to.equal(initialDepositorBalance.sub(firstDepositTotal));
      expect(await wnt.balanceOf(claimVault.address)).to.equal(initialVaultBalance.add(firstDepositTotal));

      const secondDepositParams = [
        { account: user0.address, amount: expandDecimals(50, 18) },
        { account: user1.address, amount: expandDecimals(75, 18) },
        { account: user2.address, amount: expandDecimals(25, 18) },
      ];
      const secondDepositTotal = expandDecimals(150, 18);

      await claimHandler.connect(wallet).depositFunds(wnt.address, 1, secondDepositParams);

      expect(await claimHandler.getClaimableAmount(user0.address, wnt.address, [1])).to.equal(expandDecimals(150, 18)); // 100 + 50
      expect(await claimHandler.getClaimableAmount(user1.address, wnt.address, [1])).to.equal(expandDecimals(275, 18)); // 200 + 75
      expect(await claimHandler.getClaimableAmount(user2.address, wnt.address, [1])).to.equal(expandDecimals(325, 18)); // 300 + 25
      expect(await claimHandler.getTotalClaimableAmount(wnt.address)).to.equal(
        firstDepositTotal.add(secondDepositTotal)
      );

      const totalDeposited = firstDepositTotal.add(secondDepositTotal);
      expect(await wnt.balanceOf(wallet.address)).to.equal(initialDepositorBalance.sub(totalDeposited));
      expect(await wnt.balanceOf(claimVault.address)).to.equal(initialVaultBalance.add(totalDeposited));
    });

    it("should revert with Unauthorized when caller is not CLAIM_ADMIN", async () => {
      const params = [{ account: user0.address, amount: expandDecimals(100, 18) }];

      await expect(claimHandler.connect(user1).depositFunds(wnt.address, 1, params)).to.be.revertedWithCustomError(
        errorsContract,
        "Unauthorized"
      );
    });

    it("should revert with InvalidParams when params array is empty", async () => {
      await expect(claimHandler.connect(wallet).depositFunds(wnt.address, 1, []))
        .to.be.revertedWithCustomError(errorsContract, "InvalidParams")
        .withArgs("deposit params length is 0");
    });

    it("should revert with EmptyToken when token address is zero", async () => {
      const params = [{ account: user0.address, amount: expandDecimals(100, 18) }];

      await expect(
        claimHandler.connect(wallet).depositFunds(ethers.constants.AddressZero, 1, params)
      ).to.be.revertedWithCustomError(errorsContract, "EmptyToken");
    });

    it("should revert with EmptyAccount when account address is zero", async () => {
      const params = [{ account: ethers.constants.AddressZero, amount: expandDecimals(100, 18) }];

      await expect(claimHandler.connect(wallet).depositFunds(wnt.address, 1, params)).to.be.revertedWithCustomError(
        errorsContract,
        "EmptyAccount"
      );
    });

    it("should revert with EmptyAmount when amount is zero", async () => {
      const params = [{ account: user0.address, amount: 0 }];

      await expect(claimHandler.connect(wallet).depositFunds(wnt.address, 1, params)).to.be.revertedWithCustomError(
        errorsContract,
        "EmptyAmount"
      );
    });

    it("should handle deposits with multiple distributionIds for same accounts", async () => {
      const params1 = [
        { account: user0.address, amount: expandDecimals(100, 18) },
        { account: user1.address, amount: expandDecimals(200, 18) },
      ];

      await claimHandler.connect(wallet).depositFunds(wnt.address, 1, params1);

      // deposit for distribution 2 with same accounts but different amounts
      const params2 = [
        { account: user0.address, amount: expandDecimals(50, 18) },
        { account: user1.address, amount: expandDecimals(75, 18) },
      ];
      await claimHandler.connect(wallet).depositFunds(wnt.address, 2, params2);

      expect(await claimHandler.getClaimableAmount(user0.address, wnt.address, [1])).to.equal(expandDecimals(100, 18));
      expect(await claimHandler.getClaimableAmount(user1.address, wnt.address, [1])).to.equal(expandDecimals(200, 18));

      expect(await claimHandler.getClaimableAmount(user0.address, wnt.address, [2])).to.equal(expandDecimals(50, 18));
      expect(await claimHandler.getClaimableAmount(user1.address, wnt.address, [2])).to.equal(expandDecimals(75, 18));

      expect(await claimHandler.getClaimableAmount(user0.address, wnt.address, [1, 2])).to.equal(
        expandDecimals(150, 18)
      );
      expect(await claimHandler.getClaimableAmount(user1.address, wnt.address, [1, 2])).to.equal(
        expandDecimals(275, 18)
      );

      expect(await claimHandler.getTotalClaimableAmount(wnt.address)).to.equal(expandDecimals(425, 18));
    });
  });

  describe("withdrawFunds", () => {
    it("should handle withdrawals correctly - happy path", async () => {
      const depositParams = [
        { account: user0.address, amount: expandDecimals(100, 18) },
        { account: user1.address, amount: expandDecimals(200, 18) },
        { account: user2.address, amount: expandDecimals(300, 18) },
      ];
      const totalDeposited = expandDecimals(600, 18);

      await claimHandler.connect(wallet).depositFunds(wnt.address, 1, depositParams);

      expect(await claimHandler.getClaimableAmount(user0.address, wnt.address, [1])).to.equal(expandDecimals(100, 18));
      expect(await claimHandler.getClaimableAmount(user1.address, wnt.address, [1])).to.equal(expandDecimals(200, 18));
      expect(await claimHandler.getClaimableAmount(user2.address, wnt.address, [1])).to.equal(expandDecimals(300, 18));
      expect(await claimHandler.getTotalClaimableAmount(wnt.address)).to.equal(totalDeposited);
      expect(await wnt.balanceOf(claimVault.address)).to.equal(totalDeposited);

      const initialReceiverBalance = await wnt.balanceOf(user1.address);

      const firstWithdrawalAmount = expandDecimals(300, 18); // 100 + 200

      const firstWithdrawParams = [
        { account: user0.address, distributionId: 1 },
        { account: user1.address, distributionId: 1 },
      ];
      const tx = await claimHandler.connect(user0).withdrawFunds(wnt.address, firstWithdrawParams, user1.address);

      const txReceipt = await hre.ethers.provider.getTransactionReceipt(tx.hash);
      const logs = parseLogs(fixture, txReceipt);
      const withdrawEvents = getEventDataArray(logs, "ClaimFundsWithdrawn");
      expect(withdrawEvents.length).to.equal(2);
      expect(withdrawEvents).to.deep.equal([
        {
          account: user0.address,
          token: wnt.address,
          distributionId: 1,
          amount: expandDecimals(100, 18),
          receiver: user1.address,
        },
        {
          account: user1.address,
          token: wnt.address,
          distributionId: 1,
          amount: expandDecimals(200, 18),
          receiver: user1.address,
        },
      ]);

      expect(await claimHandler.getClaimableAmount(user0.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getClaimableAmount(user1.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getClaimableAmount(user2.address, wnt.address, [1])).to.equal(expandDecimals(300, 18)); // unchanged
      expect(await claimHandler.getTotalClaimableAmount(wnt.address)).to.equal(expandDecimals(300, 18)); // 600 - 300 = 300
      expect(await wnt.balanceOf(claimVault.address)).to.equal(expandDecimals(300, 18)); // 600 - 300 = 300
      expect(await wnt.balanceOf(user1.address)).to.equal(initialReceiverBalance.add(firstWithdrawalAmount));

      const secondWithdrawalAmount = expandDecimals(300, 18);

      const secondWithdrawParams = [{ account: user2.address, distributionId: 1 }];
      await claimHandler.connect(user0).withdrawFunds(wnt.address, secondWithdrawParams, user2.address);

      expect(await claimHandler.getClaimableAmount(user0.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getClaimableAmount(user1.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getClaimableAmount(user2.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getTotalClaimableAmount(wnt.address)).to.equal(0);
      expect(await wnt.balanceOf(claimVault.address)).to.equal(0);
      expect(await wnt.balanceOf(user2.address)).to.equal(secondWithdrawalAmount);
    });

    it("should revert with Unauthorized when caller is not TIMELOCK_MULTISIG", async () => {
      await claimHandler
        .connect(wallet)
        .depositFunds(wnt.address, 1, [{ account: user0.address, amount: expandDecimals(100, 18) }]);

      const params = [{ account: user0.address, distributionId: 1 }];
      await expect(
        claimHandler.connect(user1).withdrawFunds(wnt.address, params, user1.address)
      ).to.be.revertedWithCustomError(errorsContract, "Unauthorized");
    });

    it("should revert with InvalidParams when accounts array is empty", async () => {
      await expect(claimHandler.connect(user0).withdrawFunds(wnt.address, [], user1.address))
        .to.be.revertedWithCustomError(errorsContract, "InvalidParams")
        .withArgs("withdraw params length is 0");
    });

    it("should revert with EmptyToken when token address is zero", async () => {
      const params = [{ account: user0.address, distributionId: 1 }];
      await expect(
        claimHandler.connect(user0).withdrawFunds(ethers.constants.AddressZero, params, user1.address)
      ).to.be.revertedWithCustomError(errorsContract, "EmptyToken");
    });

    it("should revert with EmptyReceiver when receiver address is zero", async () => {
      const params = [{ account: user0.address, distributionId: 1 }];
      await expect(
        claimHandler.connect(user0).withdrawFunds(wnt.address, params, ethers.constants.AddressZero)
      ).to.be.revertedWithCustomError(errorsContract, "EmptyReceiver");
    });

    it("should revert with EmptyAccount when account address is zero", async () => {
      const params = [{ account: ethers.constants.AddressZero, distributionId: 1 }];
      await expect(
        claimHandler.connect(user0).withdrawFunds(wnt.address, params, user1.address)
      ).to.be.revertedWithCustomError(errorsContract, "EmptyAccount");
    });

    it("should handle withdrawals for accounts with zero claimable amounts", async () => {
      await claimHandler
        .connect(wallet)
        .depositFunds(wnt.address, 1, [{ account: user0.address, amount: expandDecimals(100, 18) }]);

      const initialReceiverBalance = await wnt.balanceOf(user1.address);

      const withdrawParams = [
        { account: user0.address, distributionId: 1 },
        { account: user1.address, distributionId: 1 },
      ];
      await claimHandler.connect(user0).withdrawFunds(wnt.address, withdrawParams, user1.address);

      expect(await claimHandler.getClaimableAmount(user0.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getClaimableAmount(user1.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getTotalClaimableAmount(wnt.address)).to.equal(0);
      expect(await wnt.balanceOf(claimVault.address)).to.equal(0);
      expect(await wnt.balanceOf(user1.address)).to.equal(initialReceiverBalance.add(expandDecimals(100, 18)));
    });

    it("should handle withdrawals across multiple distributionIds", async () => {
      const params1 = [
        { account: user0.address, amount: expandDecimals(100, 18) },
        { account: user1.address, amount: expandDecimals(200, 18) },
      ];
      const params2 = [
        { account: user0.address, amount: expandDecimals(50, 18) },
        { account: user1.address, amount: expandDecimals(75, 18) },
      ];

      await claimHandler.connect(wallet).depositFunds(wnt.address, 1, params1);
      await claimHandler.connect(wallet).depositFunds(wnt.address, 2, params2);

      expect(await claimHandler.getTotalClaimableAmount(wnt.address)).to.equal(expandDecimals(425, 18));

      const receiver = ethers.Wallet.createRandom();

      const withdrawParams = [
        { account: user0.address, distributionId: 1 },
        { account: user0.address, distributionId: 2 },
      ];
      await claimHandler.connect(user0).withdrawFunds(wnt.address, withdrawParams, receiver.address);

      expect(await claimHandler.getClaimableAmount(user0.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getClaimableAmount(user0.address, wnt.address, [2])).to.equal(0);

      expect(await claimHandler.getClaimableAmount(user1.address, wnt.address, [1])).to.equal(expandDecimals(200, 18));
      expect(await claimHandler.getClaimableAmount(user1.address, wnt.address, [2])).to.equal(expandDecimals(75, 18));

      expect(await wnt.balanceOf(receiver.address)).to.equal(expandDecimals(150, 18));
      expect(await claimHandler.getTotalClaimableAmount(wnt.address)).to.equal(expandDecimals(275, 18));

      const withdrawParams2 = [{ account: user1.address, distributionId: 1 }];
      await claimHandler.connect(user0).withdrawFunds(wnt.address, withdrawParams2, receiver.address);

      expect(await claimHandler.getClaimableAmount(user1.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getClaimableAmount(user1.address, wnt.address, [2])).to.equal(expandDecimals(75, 18));
      expect(await wnt.balanceOf(receiver.address)).to.equal(expandDecimals(350, 18));

      expect(await claimHandler.getTotalClaimableAmount(wnt.address)).to.equal(expandDecimals(75, 18));
    });
  });

  describe("transferClaim", () => {
    it("should handle claim transfers correctly - happy path", async () => {
      const depositParams = [
        { account: user0.address, amount: expandDecimals(100, 18) },
        { account: user1.address, amount: expandDecimals(200, 18) },
        { account: user2.address, amount: expandDecimals(300, 18) },
      ];

      await claimHandler.connect(wallet).depositFunds(wnt.address, 1, depositParams);

      expect(await claimHandler.getClaimableAmount(user0.address, wnt.address, [1])).to.equal(expandDecimals(100, 18));
      expect(await claimHandler.getClaimableAmount(user1.address, wnt.address, [1])).to.equal(expandDecimals(200, 18));
      expect(await claimHandler.getClaimableAmount(user2.address, wnt.address, [1])).to.equal(expandDecimals(300, 18));
      expect(await claimHandler.getClaimableAmount(wallet.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getTotalClaimableAmount(wnt.address)).to.equal(expandDecimals(600, 18));

      const transferParams1 = [
        { token: wnt.address, distributionId: 1, fromAccount: user0.address, toAccount: wallet.address },
        { token: wnt.address, distributionId: 1, fromAccount: user1.address, toAccount: wallet.address },
      ];
      const tx = await claimHandler.connect(user0).transferClaim(wnt.address, transferParams1);

      const txReceipt = await ethers.provider.getTransactionReceipt(tx.hash);
      const logs = parseLogs(fixture, txReceipt);
      const transferEvents = getEventDataArray(logs, "ClaimFundsTransferred");
      expect(transferEvents.length).to.equal(2);
      expect(transferEvents).to.deep.equal([
        {
          fromAccount: user0.address,
          toAccount: wallet.address,
          token: wnt.address,
          distributionId: 1,
          amount: expandDecimals(100, 18),
          nextAmount: expandDecimals(100, 18), // wallet had 0, now has 100
        },
        {
          fromAccount: user1.address,
          toAccount: wallet.address,
          token: wnt.address,
          distributionId: 1,
          amount: expandDecimals(200, 18),
          nextAmount: expandDecimals(300, 18), // wallet had 100, now has 300
        },
      ]);

      expect(await claimHandler.getClaimableAmount(user0.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getClaimableAmount(user1.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getClaimableAmount(user2.address, wnt.address, [1])).to.equal(expandDecimals(300, 18)); // unchanged
      expect(await claimHandler.getClaimableAmount(wallet.address, wnt.address, [1])).to.equal(expandDecimals(300, 18)); // 100 + 200
      expect(await claimHandler.getTotalClaimableAmount(wnt.address)).to.equal(expandDecimals(600, 18)); // total unchanged

      const transferParams2 = [
        { token: wnt.address, distributionId: 1, fromAccount: user2.address, toAccount: user1.address },
      ];
      await claimHandler.connect(user0).transferClaim(wnt.address, transferParams2);

      expect(await claimHandler.getClaimableAmount(user0.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getClaimableAmount(user1.address, wnt.address, [1])).to.equal(expandDecimals(300, 18));
      expect(await claimHandler.getClaimableAmount(user2.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getClaimableAmount(wallet.address, wnt.address, [1])).to.equal(expandDecimals(300, 18));
      expect(await claimHandler.getTotalClaimableAmount(wnt.address)).to.equal(expandDecimals(600, 18)); // total unchanged
    });

    it("should revert with Unauthorized when caller is not TIMELOCK_MULTISIG", async () => {
      const transferParams = [
        { token: wnt.address, distributionId: 1, fromAccount: user0.address, toAccount: user1.address },
      ];
      await expect(
        claimHandler.connect(user1).transferClaim(wnt.address, transferParams)
      ).to.be.revertedWithCustomError(errorsContract, "Unauthorized");
    });

    it("should revert with InvalidParams when fromAccounts array is empty", async () => {
      await expect(claimHandler.connect(user0).transferClaim(wnt.address, []))
        .to.be.revertedWithCustomError(errorsContract, "InvalidParams")
        .withArgs("transfer params length is 0");
    });

    it("should revert with EmptyToken when token address is zero", async () => {
      const transferParams = [
        {
          token: ethers.constants.AddressZero,
          distributionId: 1,
          fromAccount: user0.address,
          toAccount: user1.address,
        },
      ];
      await expect(
        claimHandler.connect(user0).transferClaim(ethers.constants.AddressZero, transferParams)
      ).to.be.revertedWithCustomError(errorsContract, "EmptyToken");
    });

    it("should revert with EmptyAccount when fromAccount address is zero", async () => {
      const transferParams = [
        { token: wnt.address, distributionId: 1, fromAccount: ethers.constants.AddressZero, toAccount: user1.address },
      ];
      await expect(
        claimHandler.connect(user0).transferClaim(wnt.address, transferParams)
      ).to.be.revertedWithCustomError(errorsContract, "EmptyAccount");
    });

    it("should revert with EmptyReceiver when toAccount address is zero", async () => {
      const transferParams = [
        { token: wnt.address, distributionId: 1, fromAccount: user0.address, toAccount: ethers.constants.AddressZero },
      ];
      await expect(
        claimHandler.connect(user0).transferClaim(wnt.address, transferParams)
      ).to.be.revertedWithCustomError(errorsContract, "EmptyReceiver");
    });

    it("should revert with InvalidParams when fromAccount and toAccount are the same", async () => {
      const transferParams = [
        { token: wnt.address, distributionId: 1, fromAccount: user0.address, toAccount: user0.address },
      ];
      await expect(claimHandler.connect(user0).transferClaim(wnt.address, transferParams))
        .to.be.revertedWithCustomError(errorsContract, "InvalidParams")
        .withArgs("fromAccount and toAccount cannot be the same");
    });

    it("should handle transfers for accounts with zero claimable amounts", async () => {
      await claimHandler
        .connect(wallet)
        .depositFunds(wnt.address, 1, [{ account: user0.address, amount: expandDecimals(100, 18) }]);

      const transferParams = [
        { token: wnt.address, distributionId: 1, fromAccount: user0.address, toAccount: user2.address },
        { token: wnt.address, distributionId: 1, fromAccount: user1.address, toAccount: user2.address },
      ];
      await claimHandler.connect(user0).transferClaim(wnt.address, transferParams);

      expect(await claimHandler.getClaimableAmount(user0.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getClaimableAmount(user1.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getClaimableAmount(user2.address, wnt.address, [1])).to.equal(expandDecimals(100, 18));
      expect(await claimHandler.getTotalClaimableAmount(wnt.address)).to.equal(expandDecimals(100, 18));
    });

    it("should handle claim transfers across multiple distributionIds", async () => {
      await claimHandler
        .connect(wallet)
        .depositFunds(wnt.address, 1, [{ account: user0.address, amount: expandDecimals(100, 18) }]);
      await claimHandler
        .connect(wallet)
        .depositFunds(wnt.address, 2, [{ account: user0.address, amount: expandDecimals(200, 18) }]);
      await claimHandler
        .connect(wallet)
        .depositFunds(wnt.address, 3, [{ account: user0.address, amount: expandDecimals(50, 18) }]);

      const transferParams = [
        { token: wnt.address, distributionId: 1, fromAccount: user0.address, toAccount: user1.address },
        { token: wnt.address, distributionId: 3, fromAccount: user0.address, toAccount: user1.address },
      ];
      await claimHandler.connect(user0).transferClaim(wnt.address, transferParams);

      expect(await claimHandler.getClaimableAmount(user0.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getClaimableAmount(user0.address, wnt.address, [2])).to.equal(expandDecimals(200, 18));
      expect(await claimHandler.getClaimableAmount(user0.address, wnt.address, [3])).to.equal(0);

      expect(await claimHandler.getClaimableAmount(user1.address, wnt.address, [1])).to.equal(expandDecimals(100, 18));
      expect(await claimHandler.getClaimableAmount(user1.address, wnt.address, [2])).to.equal(0);
      expect(await claimHandler.getClaimableAmount(user1.address, wnt.address, [3])).to.equal(expandDecimals(50, 18));

      expect(await claimHandler.getTotalClaimableAmount(wnt.address)).to.equal(expandDecimals(350, 18));
    });
  });

  describe("claimFunds", () => {
    it("should handle claims correctly - happy path", async () => {
      const wntDepositParams = [
        { account: user0.address, amount: expandDecimals(100, 18) },
        { account: user1.address, amount: expandDecimals(200, 18) },
      ];
      const usdcDepositParams = [
        { account: user0.address, amount: expandDecimals(1000, 6) },
        { account: user1.address, amount: expandDecimals(2000, 6) },
      ];

      await claimHandler.connect(wallet).depositFunds(wnt.address, 1, wntDepositParams);
      await claimHandler.connect(wallet).depositFunds(usdc.address, 1, usdcDepositParams);

      const initialUser1WntBalance = await wnt.balanceOf(user1.address);
      const initialUser1UsdcBalance = await usdc.balanceOf(user1.address);
      const initialUser2WntBalance = await wnt.balanceOf(user0.address);
      const initialUser2UsdcBalance = await usdc.balanceOf(user0.address);

      expect(await claimHandler.getClaimableAmount(user0.address, wnt.address, [1])).to.equal(expandDecimals(100, 18));
      expect(await claimHandler.getClaimableAmount(user0.address, usdc.address, [1])).to.equal(expandDecimals(1000, 6));
      expect(await claimHandler.getClaimableAmount(user1.address, wnt.address, [1])).to.equal(expandDecimals(200, 18));
      expect(await claimHandler.getClaimableAmount(user1.address, usdc.address, [1])).to.equal(expandDecimals(2000, 6));

      const claimParams = [
        { token: wnt.address, distributionId: 1, termsSignature: "0x" },
        { token: usdc.address, distributionId: 1, termsSignature: "0x" },
      ];
      const tx = await claimHandler.connect(user0).claimFunds(claimParams, user2.address);

      const txReceipt = await ethers.provider.getTransactionReceipt(tx.hash);
      const logs = parseLogs(fixture, txReceipt);
      const claimEvents = getEventDataArray(logs, "ClaimFundsClaimed");
      expect(claimEvents.length).to.equal(2);
      expect(claimEvents).to.deep.equal([
        {
          account: user0.address,
          receiver: user2.address,
          token: wnt.address,
          distributionId: 1,
          amount: expandDecimals(100, 18),
        },
        {
          account: user0.address,
          receiver: user2.address,
          token: usdc.address,
          distributionId: 1,
          amount: expandDecimals(1000, 6),
        },
      ]);

      expect(await claimHandler.getClaimableAmount(user0.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getClaimableAmount(user0.address, usdc.address, [1])).to.equal(0);
      expect(await claimHandler.getClaimableAmount(user1.address, wnt.address, [1])).to.equal(expandDecimals(200, 18)); // unchanged
      expect(await claimHandler.getClaimableAmount(user1.address, usdc.address, [1])).to.equal(expandDecimals(2000, 6)); // unchanged
      expect(await claimHandler.getTotalClaimableAmount(wnt.address)).to.equal(expandDecimals(200, 18));
      expect(await claimHandler.getTotalClaimableAmount(usdc.address)).to.equal(expandDecimals(2000, 6));

      expect(await wnt.balanceOf(user2.address)).to.equal(initialUser2WntBalance.add(expandDecimals(100, 18)));
      expect(await usdc.balanceOf(user2.address)).to.equal(initialUser2UsdcBalance.add(expandDecimals(1000, 6)));

      const claimParams2 = [{ token: wnt.address, distributionId: 1, termsSignature: "0x" }];
      await claimHandler.connect(user1).claimFunds(claimParams2, user1.address);

      expect(await claimHandler.getClaimableAmount(user1.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getClaimableAmount(user1.address, usdc.address, [1])).to.equal(expandDecimals(2000, 6)); // unchanged
      expect(await claimHandler.getTotalClaimableAmount(wnt.address)).to.equal(0);
      expect(await claimHandler.getTotalClaimableAmount(usdc.address)).to.equal(expandDecimals(2000, 6));

      expect(await wnt.balanceOf(user1.address)).to.equal(initialUser1WntBalance.add(expandDecimals(200, 18)));
      expect(await usdc.balanceOf(user1.address)).to.equal(initialUser1UsdcBalance); // unchanged

      const claimParams3 = [{ token: usdc.address, distributionId: 1, termsSignature: "0x" }];
      await claimHandler.connect(user1).claimFunds(claimParams3, user2.address);

      expect(await claimHandler.getClaimableAmount(user1.address, usdc.address, [1])).to.equal(0);
      expect(await claimHandler.getTotalClaimableAmount(usdc.address)).to.equal(0);
      expect(await usdc.balanceOf(user2.address)).to.equal(expandDecimals(3000, 6));
    });

    describe("signature validation", () => {
      for (const tt of [
        {
          shouldFail: false,
          signer: () => user0,
        },
        {
          shouldFail: true,
          signer: () => user1,
        },
      ]) {
        it(
          tt.shouldFail ? "invalid signer, should revert with InvalidClaimTermsSignature" : "valid signer, should pass",
          async () => {
            const distributionId = 1;
            const terms = "I agree to the terms and conditions";

            await claimHandler.connect(wallet).setTerms(distributionId, terms);

            await claimHandler
              .connect(wallet)
              .depositFunds(wnt.address, distributionId, [{ account: user0.address, amount: expandDecimals(100, 18) }]);

            const chainId = (await ethers.provider.getNetwork()).chainId;
            const message = `${terms}\ndistributionId ${distributionId}\ncontract ${claimHandler.address.toLowerCase()}\nchainId ${chainId}`;
            const signature = await tt.signer().signMessage(message);

            const initialBalance = await wnt.balanceOf(user0.address);
            const initialVaultBalance = await wnt.balanceOf(claimVault.address);

            if (tt.shouldFail) {
              const claimParams = [{ token: wnt.address, distributionId, termsSignature: signature }];
              await expect(
                claimHandler.connect(user0).claimFunds(claimParams, user0.address)
              ).to.be.revertedWithCustomError(errorsContract, "InvalidClaimTermsSignature");
              return;
            }

            const claimParams = [{ token: wnt.address, distributionId, termsSignature: signature }];
            await claimHandler.connect(user0).claimFunds(claimParams, user0.address);

            expect(await wnt.balanceOf(user0.address)).to.equal(initialBalance.add(expandDecimals(100, 18)));
            expect(await wnt.balanceOf(claimVault.address)).to.equal(initialVaultBalance.sub(expandDecimals(100, 18)));
            expect(await claimHandler.getClaimableAmount(user0.address, wnt.address, [distributionId])).to.equal(0);
            expect(await claimHandler.getTotalClaimableAmount(wnt.address)).to.equal(0);
          }
        );
      }
    });

    it("should fail on malformed signatures", async () => {
      const distributionId = 1;
      const terms = "I agree to the terms and conditions";

      await claimHandler.connect(wallet).setTerms(distributionId, terms);
      await claimHandler
        .connect(wallet)
        .depositFunds(wnt.address, distributionId, [{ account: user0.address, amount: expandDecimals(100, 18) }]);

      const malformedSignatures = ["0x", "0x1234"];

      for (const malformedSig of malformedSignatures) {
        const claimParams = [{ token: wnt.address, distributionId, termsSignature: malformedSig }];
        await expect(claimHandler.connect(user0).claimFunds(claimParams, user0.address)).to.be.revertedWithCustomError(
          errorsContract,
          "InvalidClaimTermsSignature"
        );
      }
    });

    it("should revert with InvalidParams when params array is empty", async () => {
      await expect(claimHandler.connect(user0).claimFunds([], user0.address))
        .to.be.revertedWithCustomError(errorsContract, "InvalidParams")
        .withArgs("claim params length is 0");
    });

    it("should revert with EmptyReceiver when receiver address is zero", async () => {
      const claimParams = [{ token: wnt.address, distributionId: 1, termsSignature: "0x" }];
      await expect(
        claimHandler.connect(user0).claimFunds(claimParams, ethers.constants.AddressZero)
      ).to.be.revertedWithCustomError(errorsContract, "EmptyReceiver");
    });

    it("should revert with EmptyToken when token address is zero", async () => {
      const claimParams = [{ token: ethers.constants.AddressZero, distributionId: 1, termsSignature: "0x" }];
      await expect(claimHandler.connect(user0).claimFunds(claimParams, user0.address)).to.be.revertedWithCustomError(
        errorsContract,
        "EmptyToken"
      );
    });

    it("should revert with EmptyClaimableAmount when user has no claimable amount", async () => {
      const claimParams = [{ token: wnt.address, distributionId: 1, termsSignature: "0x" }];
      await expect(claimHandler.connect(user0).claimFunds(claimParams, user0.address)).to.be.revertedWithCustomError(
        errorsContract,
        "EmptyClaimableAmount"
      );
    });

    it("should revert with InsufficientFunds when final state is inconsistent", async () => {
      const usdcDepositParams = [
        { account: user0.address, amount: expandDecimals(1000, 6) },
        { account: user1.address, amount: expandDecimals(2000, 6) },
      ];
      await claimHandler.connect(wallet).depositFunds(usdc.address, 1, usdcDepositParams);

      await usdc.burn(claimVault.address, expandDecimals(1, 6));

      const claimParams = [{ token: usdc.address, distributionId: 1, termsSignature: "0x" }];
      await expect(claimHandler.connect(user0).claimFunds(claimParams, user0.address)).to.be.revertedWithCustomError(
        errorsContract,
        "InsufficientFunds"
      );
    });

    it("should revert if feature is disabled", async () => {
      const usdcDepositParams = [
        { account: user0.address, amount: expandDecimals(1000, 6) },
        { account: user1.address, amount: expandDecimals(2000, 6) },
      ];
      await claimHandler.connect(wallet).depositFunds(usdc.address, 1, usdcDepositParams);

      await config.setBool(keys.GENERAL_CLAIM_FEATURE_DISABLED, encodeData(["uint256"], [1]), true);

      const claimParams = [{ token: usdc.address, distributionId: 1, termsSignature: "0x" }];
      await expect(claimHandler.connect(user0).claimFunds(claimParams, user0.address)).to.be.revertedWithCustomError(
        errorsContract,
        "DisabledFeature"
      );
    });

    it("should handle claims across multiple distributionIds and tokens", async () => {
      await claimHandler
        .connect(wallet)
        .depositFunds(wnt.address, 1, [{ account: user0.address, amount: expandDecimals(100, 18) }]);
      await claimHandler
        .connect(wallet)
        .depositFunds(wnt.address, 2, [{ account: user0.address, amount: expandDecimals(200, 18) }]);
      await claimHandler
        .connect(wallet)
        .depositFunds(usdc.address, 1, [{ account: user0.address, amount: expandDecimals(1000, 6) }]);
      await claimHandler
        .connect(wallet)
        .depositFunds(usdc.address, 3, [{ account: user0.address, amount: expandDecimals(2000, 6) }]);

      const receiver = ethers.Wallet.createRandom();

      const claimParams1 = [
        { token: wnt.address, distributionId: 1, termsSignature: "0x" },
        { token: wnt.address, distributionId: 2, termsSignature: "0x" },
        { token: usdc.address, distributionId: 1, termsSignature: "0x" },
        { token: usdc.address, distributionId: 3, termsSignature: "0x" },
      ];
      await claimHandler.connect(user0).claimFunds(claimParams1, receiver.address);

      expect(await claimHandler.getClaimableAmount(user0.address, wnt.address, [1, 2])).to.equal(0);
      expect(await claimHandler.getClaimableAmount(user0.address, usdc.address, [1, 3])).to.equal(0);

      expect(await wnt.balanceOf(receiver.address)).to.equal(
        expandDecimals(300, 18) // 100 + 200
      );
      expect(await usdc.balanceOf(receiver.address)).to.equal(
        expandDecimals(3000, 6) // 1000 + 2000
      );
    });
  });

  describe("setTerms", () => {
    describe("access control", () => {
      it("should revert when non-CLAIM_ADMIN tries to set terms", async () => {
        const distributionId = 1;
        const terms = "I agree to the terms and conditions";

        await expect(claimHandler.connect(user0).setTerms(distributionId, terms)).to.be.revertedWithCustomError(
          errorsContract,
          "Unauthorized"
        );
      });

      it("should allow CLAIM_ADMIN to set terms successfully", async () => {
        const distributionId = 1;
        const terms = "I agree to the terms and conditions";

        const tx = await claimHandler.connect(wallet).setTerms(distributionId, terms);

        const txReceipt = await ethers.provider.getTransactionReceipt(tx.hash);
        const logs = parseLogs(fixture, txReceipt);
        const setTermsEvents = getEventDataArray(logs, "ClaimTermsSet");
        expect(setTermsEvents.length).to.equal(1);
        expect(setTermsEvents[0]).to.deep.equal({
          distributionId: 1,
          termsHash: ethers.utils.keccak256(ethers.utils.toUtf8Bytes(terms)),
        });
      });
    });

    describe("input validation", () => {
      it("should revert when distributionId is 0", async () => {
        const distributionId = 0;
        const terms = "I agree to the terms and conditions";
        await expect(claimHandler.connect(wallet).setTerms(distributionId, terms)).to.be.revertedWithCustomError(
          errorsContract,
          "InvalidParams"
        );
      });

      it("should revert when terms string is empty", async () => {
        const distributionId = 1;
        const emptyTerms = "";

        await expect(claimHandler.connect(wallet).setTerms(distributionId, emptyTerms)).to.be.revertedWithCustomError(
          errorsContract,
          "InvalidParams"
        );
      });

      it("should handle terms with newlines and formatting", async () => {
        const distributionId = 1;
        const termsWithFormatting = `Terms and Conditions:
        1. You must comply with all rules
        2. No unauthorized access
        3. Data will be processed according to our privacy policy

        By signing, you agree to these terms.`;

        await claimHandler.connect(wallet).setTerms(distributionId, termsWithFormatting);
        const terms = await dataStore.getString(keys.claimTermsKey(distributionId));
        expect(terms).to.equal(termsWithFormatting);
      });
    });

    describe("duplicate prevention", () => {
      it("should revert when setting identical terms for different distributionId", async () => {
        const terms = "I agree to the terms and conditions";
        const distributionId1 = 1;
        const distributionId2 = 2;

        await claimHandler.connect(wallet).setTerms(distributionId1, terms);

        await expect(claimHandler.connect(wallet).setTerms(distributionId2, terms)).to.be.revertedWithCustomError(
          errorsContract,
          "DuplicateClaimTerms"
        );
      });

      it("should allow setting different terms for different distributionId", async () => {
        const terms1 = "First set of terms and conditions";
        const terms2 = "Second set of terms and conditions";
        const distributionId1 = 1;
        const distributionId2 = 2;

        await claimHandler.connect(wallet).setTerms(distributionId1, terms1);
        await claimHandler.connect(wallet).setTerms(distributionId2, terms2);

        expect(await dataStore.getString(keys.claimTermsKey(distributionId1))).to.equal(terms1);
        expect(await dataStore.getString(keys.claimTermsKey(distributionId2))).to.equal(terms2);
      });

      it("should allow setting same distributionId with different terms", async () => {
        const terms1 = "First terms";
        const terms2 = "Second terms";
        const distributionId = 1;

        await claimHandler.connect(wallet).setTerms(distributionId, terms1);
        await claimHandler.connect(wallet).setTerms(distributionId, terms2);

        expect(await dataStore.getString(keys.claimTermsKey(distributionId))).to.equal(terms2);
      });
    });
  });

  describe("removeTerms", () => {
    describe("access control", () => {
      it("should revert when non-CLAIM_ADMIN tries to remove terms", async () => {
        const distributionId = 1;
        const terms = "Terms to be removed";

        await claimHandler.connect(wallet).setTerms(distributionId, terms);

        await expect(claimHandler.connect(user0).removeTerms(distributionId)).to.be.revertedWithCustomError(
          errorsContract,
          "Unauthorized"
        );
      });

      it("should allow CLAIM_ADMIN to remove terms successfully", async () => {
        const distributionId = 1;
        const terms = "Terms to be removed";

        await claimHandler.connect(wallet).setTerms(distributionId, terms);
        const tx = await claimHandler.connect(wallet).removeTerms(distributionId);

        const txReceipt = await ethers.provider.getTransactionReceipt(tx.hash);
        const logs = parseLogs(fixture, txReceipt);
        const removeTermsEvents = getEventDataArray(logs, "ClaimTermsRemoved");
        expect(removeTermsEvents.length).to.equal(1);
        expect(removeTermsEvents[0]).to.deep.equal({
          distributionId: 1,
        });
      });
    });

    describe("functionality", () => {
      it("should successfully remove existing terms", async () => {
        const distributionId = 1;
        const terms = "Terms to be removed";

        await claimHandler.connect(wallet).setTerms(distributionId, terms);
        expect(await dataStore.getString(keys.claimTermsKey(distributionId))).to.equal(terms);

        await claimHandler.connect(wallet).removeTerms(distributionId);
        expect(await dataStore.getString(keys.claimTermsKey(distributionId))).to.equal("");

        await claimHandler
          .connect(wallet)
          .depositFunds(wnt.address, distributionId, [{ account: user0.address, amount: expandDecimals(100, 18) }]);

        // can claim without signature
        const claimParams = [{ token: wnt.address, distributionId, termsSignature: "0x" }];
        await claimHandler.connect(user0).claimFunds(claimParams, user0.address);
      });

      it("should revert when trying to remove non-existent terms", async () => {
        const distributionId = 999;

        await expect(claimHandler.connect(wallet).removeTerms(distributionId))
          .to.be.revertedWithCustomError(errorsContract, "InvalidParams")
          .withArgs("terms not found");
      });

      it("should allow setting new terms after removal", async () => {
        const distributionId = 1;
        const originalTerms = "Original terms";
        const newTerms = "New terms after removal";

        await claimHandler.connect(wallet).setTerms(distributionId, originalTerms);
        await claimHandler.connect(wallet).removeTerms(distributionId);
        await claimHandler.connect(wallet).setTerms(distributionId, newTerms);
        expect(await dataStore.getString(keys.claimTermsKey(distributionId))).to.equal(newTerms);
      });
    });
  });
});
