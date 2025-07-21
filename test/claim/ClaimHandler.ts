import { expect } from "chai";
import { ethers } from "hardhat";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals, formatAmount } from "../../utils/math";
import { grantRole } from "../../utils/role";
import { errorsContract } from "../../utils/error";
import { deployContract } from "../../utils/deploy";
import { ClaimVault } from "../../typechain-types";

describe("ClaimHandler", () => {
  let fixture;
  let user0, user1, user2, wallet;
  let roleStore, dataStore, eventEmitter, claimHandler, claimVault: ClaimVault;
  let wnt, usdc;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1, user2, wallet } = fixture.accounts);
    ({ roleStore, dataStore, eventEmitter, wnt, usdc } = fixture.contracts);

    const claimVaultContract = await deployContract("ClaimVault", [roleStore.address, dataStore.address]);
    claimVault = (await ethers.getContractAt("ClaimVault", claimVaultContract.address)) as ClaimVault;

    const claimEventUtils = await deployContract("ClaimEventUtils", []);

    claimHandler = await deployContract(
      "ClaimHandler",
      [roleStore.address, dataStore.address, eventEmitter.address, claimVaultContract.address],
      {
        libraries: {
          ClaimEventUtils: claimEventUtils.address,
        },
      }
    );

    await grantRole(roleStore, wallet.address, "CONFIG_KEEPER");
    await grantRole(roleStore, user0.address, "TIMELOCK_MULTISIG");
    await grantRole(roleStore, claimHandler.address, "CONTROLLER");

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

      const firstDepositAccounts = [user0.address, user1.address, user2.address];
      const firstDepositAmounts = [expandDecimals(100, 18), expandDecimals(200, 18), expandDecimals(300, 18)];
      const firstDepositTotal = expandDecimals(600, 18);

      await claimHandler.connect(wallet).depositFunds(wnt.address, 1, firstDepositAccounts, firstDepositAmounts);

      expect(await claimHandler.getClaimableAmount(user0.address, wnt.address, [1])).to.equal(expandDecimals(100, 18));
      expect(await claimHandler.getClaimableAmount(user1.address, wnt.address, [1])).to.equal(expandDecimals(200, 18));
      expect(await claimHandler.getClaimableAmount(user2.address, wnt.address, [1])).to.equal(expandDecimals(300, 18));
      expect(await claimHandler.getTotalClaimableAmount(wnt.address)).to.equal(firstDepositTotal);

      expect(await wnt.balanceOf(wallet.address)).to.equal(initialDepositorBalance.sub(firstDepositTotal));
      expect(await wnt.balanceOf(claimVault.address)).to.equal(initialVaultBalance.add(firstDepositTotal));

      const secondDepositAccounts = [user0.address, user1.address, user2.address];
      const secondDepositAmounts = [expandDecimals(50, 18), expandDecimals(75, 18), expandDecimals(25, 18)];
      const secondDepositTotal = expandDecimals(150, 18);

      await claimHandler.connect(wallet).depositFunds(wnt.address, 1, secondDepositAccounts, secondDepositAmounts);

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

    it("should revert with Unauthorized when caller is not CONFIG_KEEPER", async () => {
      const accounts = [user0.address];
      const amounts = [expandDecimals(100, 18)];

      await expect(
        claimHandler.connect(user1).depositFunds(wnt.address, 1, accounts, amounts)
      ).to.be.revertedWithCustomError(errorsContract, "Unauthorized");
    });

    it("should revert with InvalidParams when amounts array is empty", async () => {
      await expect(claimHandler.connect(wallet).depositFunds(wnt.address, 1, [], [])).to.be.revertedWithCustomError(
        errorsContract,
        "InvalidParams"
      );
    });

    it("should revert with InvalidParams when arrays have different lengths", async () => {
      const accounts = [user0.address, user1.address];
      const amounts = [expandDecimals(100, 18)]; // Different length

      await expect(
        claimHandler.connect(wallet).depositFunds(wnt.address, 1, accounts, amounts)
      ).to.be.revertedWithCustomError(errorsContract, "InvalidParams");
    });

    it("should revert with EmptyToken when token address is zero", async () => {
      const accounts = [user0.address];
      const amounts = [expandDecimals(100, 18)];

      await expect(
        claimHandler.connect(wallet).depositFunds(ethers.constants.AddressZero, 1, accounts, amounts)
      ).to.be.revertedWithCustomError(errorsContract, "EmptyToken");
    });

    it("should revert with EmptyAccount when account address is zero", async () => {
      const accounts = [ethers.constants.AddressZero];
      const amounts = [expandDecimals(100, 18)];

      await expect(
        claimHandler.connect(wallet).depositFunds(wnt.address, 1, accounts, amounts)
      ).to.be.revertedWithCustomError(errorsContract, "EmptyAccount");
    });

    it("should revert with EmptyAmount when amount is zero", async () => {
      const accounts = [user0.address];
      const amounts = [0];

      await expect(
        claimHandler.connect(wallet).depositFunds(wnt.address, 1, accounts, amounts)
      ).to.be.revertedWithCustomError(errorsContract, "EmptyAmount");
    });
  });

  describe("withdrawFunds", () => {
    it("should handle withdrawals correctly - happy path", async () => {
      const depositAccounts = [user0.address, user1.address, user2.address];
      const depositAmounts = [expandDecimals(100, 18), expandDecimals(200, 18), expandDecimals(300, 18)];
      const totalDeposited = expandDecimals(600, 18);

      await claimHandler.connect(wallet).depositFunds(wnt.address, 1, depositAccounts, depositAmounts);

      expect(await claimHandler.getClaimableAmount(user0.address, wnt.address, [1])).to.equal(expandDecimals(100, 18));
      expect(await claimHandler.getClaimableAmount(user1.address, wnt.address, [1])).to.equal(expandDecimals(200, 18));
      expect(await claimHandler.getClaimableAmount(user2.address, wnt.address, [1])).to.equal(expandDecimals(300, 18));
      expect(await claimHandler.getTotalClaimableAmount(wnt.address)).to.equal(totalDeposited);
      expect(await wnt.balanceOf(claimVault.address)).to.equal(totalDeposited);

      const initialReceiverBalance = await wnt.balanceOf(user1.address);

      const firstWithdrawalAccounts = [user0.address, user1.address];
      const firstWithdrawalAmount = expandDecimals(300, 18); // 100 + 200

      await claimHandler.connect(user0).withdrawFunds(wnt.address, firstWithdrawalAccounts, [1], user1.address);

      expect(await claimHandler.getClaimableAmount(user0.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getClaimableAmount(user1.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getClaimableAmount(user2.address, wnt.address, [1])).to.equal(expandDecimals(300, 18)); // unchanged
      expect(await claimHandler.getTotalClaimableAmount(wnt.address)).to.equal(expandDecimals(300, 18)); // 600 - 300 = 300
      expect(await wnt.balanceOf(claimVault.address)).to.equal(expandDecimals(300, 18)); // 600 - 300 = 300
      expect(await wnt.balanceOf(user1.address)).to.equal(initialReceiverBalance.add(firstWithdrawalAmount));

      const secondWithdrawalAccounts = [user2.address];
      const secondWithdrawalAmount = expandDecimals(300, 18);

      await claimHandler.connect(user0).withdrawFunds(wnt.address, secondWithdrawalAccounts, [1], user2.address);

      expect(await claimHandler.getClaimableAmount(user0.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getClaimableAmount(user1.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getClaimableAmount(user2.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getTotalClaimableAmount(wnt.address)).to.equal(0);
      expect(await wnt.balanceOf(claimVault.address)).to.equal(0);
      expect(await wnt.balanceOf(user2.address)).to.equal(secondWithdrawalAmount);
    });

    it("should revert with Unauthorized when caller is not TIMELOCK_MULTISIG", async () => {
      // Setup some funds first
      await claimHandler.connect(wallet).depositFunds(wnt.address, 1, [user0.address], [expandDecimals(100, 18)]);

      await expect(
        claimHandler.connect(user1).withdrawFunds(wnt.address, [user0.address], [1], user1.address)
      ).to.be.revertedWithCustomError(errorsContract, "Unauthorized");
    });

    it("should revert with InvalidParams when accounts array is empty", async () => {
      await expect(
        claimHandler.connect(user0).withdrawFunds(wnt.address, [], [1], user1.address)
      ).to.be.revertedWithCustomError(errorsContract, "InvalidParams");
    });

    it("should revert with EmptyToken when token address is zero", async () => {
      await expect(
        claimHandler.connect(user0).withdrawFunds(ethers.constants.AddressZero, [user0.address], [1], user1.address)
      ).to.be.revertedWithCustomError(errorsContract, "EmptyToken");
    });

    it("should revert with EmptyReceiver when receiver address is zero", async () => {
      await expect(
        claimHandler.connect(user0).withdrawFunds(wnt.address, [user0.address], [1], ethers.constants.AddressZero)
      ).to.be.revertedWithCustomError(errorsContract, "EmptyReceiver");
    });

    it("should revert with EmptyAccount when account address is zero", async () => {
      await expect(
        claimHandler.connect(user0).withdrawFunds(wnt.address, [ethers.constants.AddressZero], [1], user1.address)
      ).to.be.revertedWithCustomError(errorsContract, "EmptyAccount");
    });

    it("should handle withdrawals for accounts with zero claimable amounts", async () => {
      await claimHandler.connect(wallet).depositFunds(wnt.address, 1, [user0.address], [expandDecimals(100, 18)]);

      const initialReceiverBalance = await wnt.balanceOf(user1.address);

      await claimHandler.connect(user0).withdrawFunds(wnt.address, [user0.address, user1.address], [1], user1.address);

      expect(await claimHandler.getClaimableAmount(user0.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getClaimableAmount(user1.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getTotalClaimableAmount(wnt.address)).to.equal(0);
      expect(await wnt.balanceOf(claimVault.address)).to.equal(0);
      expect(await wnt.balanceOf(user1.address)).to.equal(initialReceiverBalance.add(expandDecimals(100, 18)));
    });
  });

  describe("transferClaim", () => {
    it("should handle claim transfers correctly - happy path", async () => {
      const depositAccounts = [user0.address, user1.address, user2.address];
      const depositAmounts = [expandDecimals(100, 18), expandDecimals(200, 18), expandDecimals(300, 18)];

      await claimHandler.connect(wallet).depositFunds(wnt.address, 1, depositAccounts, depositAmounts);

      expect(await claimHandler.getClaimableAmount(user0.address, wnt.address, [1])).to.equal(expandDecimals(100, 18));
      expect(await claimHandler.getClaimableAmount(user1.address, wnt.address, [1])).to.equal(expandDecimals(200, 18));
      expect(await claimHandler.getClaimableAmount(user2.address, wnt.address, [1])).to.equal(expandDecimals(300, 18));
      expect(await claimHandler.getClaimableAmount(wallet.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getTotalClaimableAmount(wnt.address)).to.equal(expandDecimals(600, 18));

      const fromAccounts1 = [user0.address, user1.address];
      const toAccounts1 = [wallet.address, wallet.address];

      await claimHandler.connect(user0).transferClaim(wnt.address, [1], fromAccounts1, toAccounts1);

      expect(await claimHandler.getClaimableAmount(user0.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getClaimableAmount(user1.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getClaimableAmount(user2.address, wnt.address, [1])).to.equal(expandDecimals(300, 18)); // unchanged
      expect(await claimHandler.getClaimableAmount(wallet.address, wnt.address, [1])).to.equal(expandDecimals(300, 18)); // 100 + 200
      expect(await claimHandler.getTotalClaimableAmount(wnt.address)).to.equal(expandDecimals(600, 18)); // total unchanged

      const fromAccounts2 = [user2.address];
      const toAccounts2 = [user1.address];

      await claimHandler.connect(user0).transferClaim(wnt.address, [1], fromAccounts2, toAccounts2);

      expect(await claimHandler.getClaimableAmount(user0.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getClaimableAmount(user1.address, wnt.address, [1])).to.equal(expandDecimals(300, 18));
      expect(await claimHandler.getClaimableAmount(user2.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getClaimableAmount(wallet.address, wnt.address, [1])).to.equal(expandDecimals(300, 18));
      expect(await claimHandler.getTotalClaimableAmount(wnt.address)).to.equal(expandDecimals(600, 18)); // total unchanged
    });

    it("should revert with Unauthorized when caller is not TIMELOCK_MULTISIG", async () => {
      await expect(
        claimHandler.connect(user1).transferClaim(wnt.address, [1], [user0.address], [user1.address])
      ).to.be.revertedWithCustomError(errorsContract, "Unauthorized");
    });

    it("should revert with InvalidParams when fromAccounts array is empty", async () => {
      await expect(
        claimHandler.connect(user0).transferClaim(wnt.address, [1], [], [user1.address])
      ).to.be.revertedWithCustomError(errorsContract, "InvalidParams");
    });

    it("should revert with InvalidParams when arrays have different lengths", async () => {
      await expect(
        claimHandler.connect(user0).transferClaim(wnt.address, [1], [user0.address], [user1.address, user2.address])
      ).to.be.revertedWithCustomError(errorsContract, "InvalidParams");
    });

    it("should revert with EmptyToken when token address is zero", async () => {
      await expect(
        claimHandler.connect(user0).transferClaim(ethers.constants.AddressZero, [1], [user0.address], [user1.address])
      ).to.be.revertedWithCustomError(errorsContract, "EmptyToken");
    });

    it("should revert with EmptyAccount when fromAccount address is zero", async () => {
      await expect(
        claimHandler.connect(user0).transferClaim(wnt.address, [1], [ethers.constants.AddressZero], [user1.address])
      ).to.be.revertedWithCustomError(errorsContract, "EmptyAccount");
    });

    it("should revert with EmptyReceiver when toAccount address is zero", async () => {
      await expect(
        claimHandler.connect(user0).transferClaim(wnt.address, [1], [user0.address], [ethers.constants.AddressZero])
      ).to.be.revertedWithCustomError(errorsContract, "EmptyReceiver");
    });

    it("should handle transfers for accounts with zero claimable amounts", async () => {
      await claimHandler.connect(wallet).depositFunds(wnt.address, 1, [user0.address], [expandDecimals(100, 18)]);

      await claimHandler
        .connect(user0)
        .transferClaim(wnt.address, [1], [user0.address, user1.address], [user2.address, user2.address]);

      expect(await claimHandler.getClaimableAmount(user0.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getClaimableAmount(user1.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getClaimableAmount(user2.address, wnt.address, [1])).to.equal(expandDecimals(100, 18));
      expect(await claimHandler.getTotalClaimableAmount(wnt.address)).to.equal(expandDecimals(100, 18));
    });
  });

  describe("claimFunds", () => {
    it("should handle claims correctly - happy path", async () => {
      const wntDepositAccounts = [user0.address, user1.address];
      const wntDepositAmounts = [expandDecimals(100, 18), expandDecimals(200, 18)];
      const usdcDepositAccounts = [user0.address, user1.address];
      const usdcDepositAmounts = [expandDecimals(1000, 6), expandDecimals(2000, 6)];

      await claimHandler.connect(wallet).depositFunds(wnt.address, 1, wntDepositAccounts, wntDepositAmounts);
      await claimHandler.connect(wallet).depositFunds(usdc.address, 1, usdcDepositAccounts, usdcDepositAmounts);

      const initialUser0WntBalance = await wnt.balanceOf(user0.address);
      const initialUser0UsdcBalance = await usdc.balanceOf(user0.address);
      const initialUser1WntBalance = await wnt.balanceOf(user1.address);
      const initialUser1UsdcBalance = await usdc.balanceOf(user1.address);

      expect(await claimHandler.getClaimableAmount(user0.address, wnt.address, [1])).to.equal(expandDecimals(100, 18));
      expect(await claimHandler.getClaimableAmount(user0.address, usdc.address, [1])).to.equal(expandDecimals(1000, 6));
      expect(await claimHandler.getClaimableAmount(user1.address, wnt.address, [1])).to.equal(expandDecimals(200, 18));
      expect(await claimHandler.getClaimableAmount(user1.address, usdc.address, [1])).to.equal(expandDecimals(2000, 6));

      await claimHandler.connect(user0).claimFunds([wnt.address, usdc.address], [1], user0.address);

      expect(await claimHandler.getClaimableAmount(user0.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getClaimableAmount(user0.address, usdc.address, [1])).to.equal(0);
      expect(await claimHandler.getClaimableAmount(user1.address, wnt.address, [1])).to.equal(expandDecimals(200, 18)); // unchanged
      expect(await claimHandler.getClaimableAmount(user1.address, usdc.address, [1])).to.equal(expandDecimals(2000, 6)); // unchanged
      expect(await claimHandler.getTotalClaimableAmount(wnt.address)).to.equal(expandDecimals(200, 18));
      expect(await claimHandler.getTotalClaimableAmount(usdc.address)).to.equal(expandDecimals(2000, 6));

      expect(await wnt.balanceOf(user0.address)).to.equal(initialUser0WntBalance.add(expandDecimals(100, 18)));
      expect(await usdc.balanceOf(user0.address)).to.equal(initialUser0UsdcBalance.add(expandDecimals(1000, 6)));

      await claimHandler.connect(user1).claimFunds([wnt.address], [1], user1.address);

      expect(await claimHandler.getClaimableAmount(user1.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getClaimableAmount(user1.address, usdc.address, [1])).to.equal(expandDecimals(2000, 6)); // unchanged
      expect(await claimHandler.getTotalClaimableAmount(wnt.address)).to.equal(0);
      expect(await claimHandler.getTotalClaimableAmount(usdc.address)).to.equal(expandDecimals(2000, 6));

      expect(await wnt.balanceOf(user1.address)).to.equal(initialUser1WntBalance.add(expandDecimals(200, 18)));
      expect(await usdc.balanceOf(user1.address)).to.equal(initialUser1UsdcBalance); // unchanged

      await claimHandler.connect(user1).claimFunds([usdc.address], [1], user2.address);

      expect(await claimHandler.getClaimableAmount(user1.address, usdc.address, [1])).to.equal(0);
      expect(await claimHandler.getTotalClaimableAmount(usdc.address)).to.equal(0);
      expect(await usdc.balanceOf(user2.address)).to.equal(expandDecimals(2000, 6));
    });

    it("should revert with InvalidParams when tokens array is empty", async () => {
      await expect(claimHandler.connect(user0).claimFunds([], [1], user0.address)).to.be.revertedWithCustomError(
        errorsContract,
        "InvalidParams"
      );
    });

    it("should revert with EmptyReceiver when receiver address is zero", async () => {
      await expect(
        claimHandler.connect(user0).claimFunds([wnt.address], [1], ethers.constants.AddressZero)
      ).to.be.revertedWithCustomError(errorsContract, "EmptyReceiver");
    });

    it("should revert with EmptyToken when token address is zero", async () => {
      await expect(
        claimHandler.connect(user0).claimFunds([ethers.constants.AddressZero], [1], user0.address)
      ).to.be.revertedWithCustomError(errorsContract, "EmptyToken");
    });

    it("should revert with EmptyClaimableAmount when user has no claimable amount", async () => {
      await expect(
        claimHandler.connect(user0).claimFunds([wnt.address], [1], user0.address)
      ).to.be.revertedWithCustomError(errorsContract, "EmptyClaimableAmount");
    });

    it("should revert with InsufficientFunds when final state is inconsistent", async () => {
      const usdcDepositAccounts = [user0.address, user1.address];
      const usdcDepositAmounts = [expandDecimals(1000, 6), expandDecimals(2000, 6)];
      await claimHandler.connect(wallet).depositFunds(usdc.address, 1, usdcDepositAccounts, usdcDepositAmounts);

      await usdc.burn(claimVault.address, expandDecimals(1, 6));

      await expect(
        claimHandler.connect(user0).claimFunds([usdc.address], [1], user0.address)
      ).to.be.revertedWithCustomError(errorsContract, "InsufficientFunds");
    });
  });
});
