import { expect } from "chai";
import { ethers } from "hardhat";

import { deployFixture } from "../../utils/fixture";
import { expandDecimals } from "../../utils/math";
import { grantRole } from "../../utils/role";
import { errorsContract } from "../../utils/error";
import { deployContract } from "../../utils/deploy";
import { ClaimVault } from "../../typechain-types";
import * as keys from "../../utils/keys";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("ClaimHandler", () => {
  let user0, user1, user2, wallet;
  let roleStore, dataStore, eventEmitter, claimHandler, claimVault: ClaimVault;
  let wnt, usdc;

  async function setup() {
    const fixture = await deployFixture();
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
  }

  beforeEach(async () => {
    await loadFixture(setup);
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

      await claimHandler.connect(wallet).depositFunds(wnt.address, 1, firstDepositParams);

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

    it("should revert with Unauthorized when caller is not CONFIG_KEEPER", async () => {
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
      await claimHandler.connect(user0).withdrawFunds(wnt.address, firstWithdrawParams, user1.address);

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
      // Setup some funds first
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

      const fromAccounts1 = [user0.address, user1.address];
      const toAccounts1 = [wallet.address, wallet.address];

      await claimHandler.connect(user0).transferClaim(wnt.address, [1, 1], fromAccounts1, toAccounts1);

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
        claimHandler.connect(user0).transferClaim(wnt.address, [], [], [user1.address])
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
      await claimHandler
        .connect(wallet)
        .depositFunds(wnt.address, 1, [{ account: user0.address, amount: expandDecimals(100, 18) }]);

      await claimHandler
        .connect(user0)
        .transferClaim(wnt.address, [1, 1], [user0.address, user1.address], [user2.address, user2.address]);

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

      await claimHandler
        .connect(user0)
        .transferClaim(wnt.address, [1, 3], [user0.address, user0.address], [user1.address, user1.address]);

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

      const initialUser0WntBalance = await wnt.balanceOf(user0.address);
      const initialUser0UsdcBalance = await usdc.balanceOf(user0.address);
      const initialUser1WntBalance = await wnt.balanceOf(user1.address);
      const initialUser1UsdcBalance = await usdc.balanceOf(user1.address);

      expect(await claimHandler.getClaimableAmount(user0.address, wnt.address, [1])).to.equal(expandDecimals(100, 18));
      expect(await claimHandler.getClaimableAmount(user0.address, usdc.address, [1])).to.equal(expandDecimals(1000, 6));
      expect(await claimHandler.getClaimableAmount(user1.address, wnt.address, [1])).to.equal(expandDecimals(200, 18));
      expect(await claimHandler.getClaimableAmount(user1.address, usdc.address, [1])).to.equal(expandDecimals(2000, 6));

      await claimHandler.connect(user0).claimFunds([wnt.address, usdc.address], [1, 1], ["0x", "0x"], user0.address);

      expect(await claimHandler.getClaimableAmount(user0.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getClaimableAmount(user0.address, usdc.address, [1])).to.equal(0);
      expect(await claimHandler.getClaimableAmount(user1.address, wnt.address, [1])).to.equal(expandDecimals(200, 18)); // unchanged
      expect(await claimHandler.getClaimableAmount(user1.address, usdc.address, [1])).to.equal(expandDecimals(2000, 6)); // unchanged
      expect(await claimHandler.getTotalClaimableAmount(wnt.address)).to.equal(expandDecimals(200, 18));
      expect(await claimHandler.getTotalClaimableAmount(usdc.address)).to.equal(expandDecimals(2000, 6));

      expect(await wnt.balanceOf(user0.address)).to.equal(initialUser0WntBalance.add(expandDecimals(100, 18)));
      expect(await usdc.balanceOf(user0.address)).to.equal(initialUser0UsdcBalance.add(expandDecimals(1000, 6)));

      await claimHandler.connect(user1).claimFunds([wnt.address], [1], ["0x"], user1.address);

      expect(await claimHandler.getClaimableAmount(user1.address, wnt.address, [1])).to.equal(0);
      expect(await claimHandler.getClaimableAmount(user1.address, usdc.address, [1])).to.equal(expandDecimals(2000, 6)); // unchanged
      expect(await claimHandler.getTotalClaimableAmount(wnt.address)).to.equal(0);
      expect(await claimHandler.getTotalClaimableAmount(usdc.address)).to.equal(expandDecimals(2000, 6));

      expect(await wnt.balanceOf(user1.address)).to.equal(initialUser1WntBalance.add(expandDecimals(200, 18)));
      expect(await usdc.balanceOf(user1.address)).to.equal(initialUser1UsdcBalance); // unchanged

      await claimHandler.connect(user1).claimFunds([usdc.address], [1], ["0x"], user2.address);

      expect(await claimHandler.getClaimableAmount(user1.address, usdc.address, [1])).to.equal(0);
      expect(await claimHandler.getTotalClaimableAmount(usdc.address)).to.equal(0);
      expect(await usdc.balanceOf(user2.address)).to.equal(expandDecimals(2000, 6));
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

            const signature = await tt.signer().signMessage(terms);

            const initialBalance = await wnt.balanceOf(user0.address);
            const initialVaultBalance = await wnt.balanceOf(claimVault.address);

            if (tt.shouldFail) {
              await expect(
                claimHandler.connect(user0).claimFunds([wnt.address], [distributionId], [signature], user0.address)
              ).to.be.revertedWithCustomError(errorsContract, "InvalidClaimTermsSignature");
              return;
            }

            await claimHandler.connect(user0).claimFunds([wnt.address], [distributionId], [signature], user0.address);

            expect(await wnt.balanceOf(user0.address)).to.equal(initialBalance.add(expandDecimals(100, 18)));
            expect(await wnt.balanceOf(claimVault.address)).to.equal(initialVaultBalance.sub(expandDecimals(100, 18)));
            expect(await claimHandler.getClaimableAmount(user0.address, wnt.address, [distributionId])).to.equal(0);
            expect(await claimHandler.getTotalClaimableAmount(wnt.address)).to.equal(0);
          }
        );
      }
    });

    it("should revert with InvalidClaimTermsSignature when signature is invalid", async () => {
      const distributionId = 1;
      const terms = "I agree to the terms and conditions";

      await claimHandler.connect(wallet).setTerms(distributionId, terms);

      await claimHandler
        .connect(wallet)
        .depositFunds(wnt.address, distributionId, [{ account: user0.address, amount: expandDecimals(100, 18) }]);

      const signature = await user0.signMessage("invalid terms");
      await expect(
        claimHandler.connect(user0).claimFunds([wnt.address], [distributionId], [signature], user0.address)
      ).to.be.revertedWithCustomError(errorsContract, "InvalidClaimTermsSignature");
    });

    it("should revert with InvalidParams when tokens array is empty", async () => {
      await expect(claimHandler.connect(user0).claimFunds([], [], [], user0.address)).to.be.revertedWithCustomError(
        errorsContract,
        "InvalidParams"
      );
    });

    it("should revert with EmptyReceiver when receiver address is zero", async () => {
      await expect(
        claimHandler.connect(user0).claimFunds([wnt.address], [1], ["0x"], ethers.constants.AddressZero)
      ).to.be.revertedWithCustomError(errorsContract, "EmptyReceiver");
    });

    it("should revert with EmptyToken when token address is zero", async () => {
      await expect(
        claimHandler.connect(user0).claimFunds([ethers.constants.AddressZero], [1], ["0x"], user0.address)
      ).to.be.revertedWithCustomError(errorsContract, "EmptyToken");
    });

    it("should revert with EmptyClaimableAmount when user has no claimable amount", async () => {
      await expect(
        claimHandler.connect(user0).claimFunds([wnt.address], [1], ["0x"], user0.address)
      ).to.be.revertedWithCustomError(errorsContract, "EmptyClaimableAmount");
    });

    it("should revert with InsufficientFunds when final state is inconsistent", async () => {
      const usdcDepositParams = [
        { account: user0.address, amount: expandDecimals(1000, 6) },
        { account: user1.address, amount: expandDecimals(2000, 6) },
      ];
      await claimHandler.connect(wallet).depositFunds(usdc.address, 1, usdcDepositParams);

      await usdc.burn(claimVault.address, expandDecimals(1, 6));

      await expect(
        claimHandler.connect(user0).claimFunds([usdc.address], [1], ["0x"], user0.address)
      ).to.be.revertedWithCustomError(errorsContract, "InsufficientFunds");
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

      await claimHandler.connect(user0).claimFunds([wnt.address, wnt.address], [1, 2], ["0x", "0x"], receiver.address);
      await claimHandler
        .connect(user0)
        .claimFunds([usdc.address, usdc.address], [1, 3], ["0x", "0x"], receiver.address);

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
      it("should revert when non-CONFIG_KEEPER tries to set terms", async () => {
        const distributionId = 1;
        const terms = "I agree to the terms and conditions";

        await expect(claimHandler.connect(user0).setTerms(distributionId, terms)).to.be.revertedWithCustomError(
          errorsContract,
          "Unauthorized"
        );
      });

      it("should allow CONFIG_KEEPER to set terms successfully", async () => {
        const distributionId = 1;
        const terms = "I agree to the terms and conditions";

        await claimHandler.connect(wallet).setTerms(distributionId, terms);
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
      it("should revert when non-CONFIG_KEEPER tries to remove terms", async () => {
        const distributionId = 1;
        const terms = "Terms to be removed";

        await claimHandler.connect(wallet).setTerms(distributionId, terms);

        await expect(claimHandler.connect(user0).removeTerms(distributionId)).to.be.revertedWithCustomError(
          errorsContract,
          "Unauthorized"
        );
      });

      it("should allow CONFIG_KEEPER to remove terms successfully", async () => {
        const distributionId = 1;
        const terms = "Terms to be removed";

        await claimHandler.connect(wallet).setTerms(distributionId, terms);
        await claimHandler.connect(wallet).removeTerms(distributionId);
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
        await claimHandler.connect(user0).claimFunds([wnt.address], [distributionId], ["0x"], user0.address);
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
