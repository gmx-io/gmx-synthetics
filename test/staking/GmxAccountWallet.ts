import { expect } from "chai";
import { deployFixture } from "../../utils/fixture";
import { grantRole } from "../../utils/role";
import { expandDecimals } from "../../utils/math";

describe("GmxAccountWallet", () => {
  let fixture;
  let user0, user1, user2;
  let roleStore, gmxAccountWalletFactory, gmx;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1, user2 } = fixture.accounts);
    ({ roleStore, gmxAccountWalletFactory, gmx } = fixture.contracts);
  });

  describe("GmxAccountWalletFactory", () => {
    it("computes deterministic wallet address", async () => {
      const addr1 = await gmxAccountWalletFactory.getWalletAddress(user0.address);
      const addr2 = await gmxAccountWalletFactory.getWalletAddress(user0.address);
      expect(addr1).to.equal(addr2);
    });

    it("different accounts get different wallet addresses", async () => {
      const addr0 = await gmxAccountWalletFactory.getWalletAddress(user0.address);
      const addr1 = await gmxAccountWalletFactory.getWalletAddress(user1.address);
      expect(addr0).to.not.equal(addr1);
    });

    it("deploys wallet on first call to getOrCreateWallet", async () => {
      const predictedAddr = await gmxAccountWalletFactory.getWalletAddress(user0.address);

      const tx = await gmxAccountWalletFactory.getOrCreateWallet(user0.address);
      const receipt = await tx.wait();

      // Should emit WalletCreated event
      const event = receipt.events.find((e) => e.event === "WalletCreated");
      expect(event).to.not.be.undefined;
      expect(event.args.account).to.equal(user0.address);
      expect(event.args.wallet).to.equal(predictedAddr);
    });

    it("returns existing wallet on subsequent calls without creating new one", async () => {
      const addr1 = await gmxAccountWalletFactory.callStatic.getOrCreateWallet(user0.address);
      await gmxAccountWalletFactory.getOrCreateWallet(user0.address);

      const addr2 = await gmxAccountWalletFactory.callStatic.getOrCreateWallet(user0.address);
      expect(addr1).to.equal(addr2);
    });
  });

  describe("GmxAccountWallet", () => {
    let walletAddress;
    let wallet;

    beforeEach(async () => {
      await gmxAccountWalletFactory.getOrCreateWallet(user0.address);
      walletAddress = await gmxAccountWalletFactory.getWalletAddress(user0.address);
      wallet = await hre.ethers.getContractAt("GmxAccountWallet", walletAddress);
    });

    it("allows CONTROLLER to execute arbitrary calls", async () => {
      // Grant CONTROLLER role to user1
      await grantRole(roleStore, user1.address, "CONTROLLER");

      // Mint some GMX to the wallet
      await gmx.mint(walletAddress, expandDecimals(100, 18));

      // Execute a transfer call via the wallet
      const transferData = gmx.interface.encodeFunctionData("transfer", [user2.address, expandDecimals(50, 18)]);
      await wallet.connect(user1)["execute(address,bytes)"](gmx.address, transferData);

      expect(await gmx.balanceOf(user2.address)).to.equal(expandDecimals(50, 18));
      expect(await gmx.balanceOf(walletAddress)).to.equal(expandDecimals(50, 18));
    });

    it("reverts when non-CONTROLLER calls execute", async () => {
      const transferData = gmx.interface.encodeFunctionData("transfer", [user2.address, expandDecimals(50, 18)]);
      await expect(
        wallet.connect(user0)["execute(address,bytes)"](gmx.address, transferData)
      ).to.be.revertedWithCustomError(wallet, "Unauthorized");
    });

    it("forwards revert reason from target", async () => {
      // Grant CONTROLLER role to user1
      await grantRole(roleStore, user1.address, "CONTROLLER");

      // Try to transfer more than balance (should revert)
      const transferData = gmx.interface.encodeFunctionData("transfer", [user2.address, expandDecimals(1000, 18)]);
      await expect(wallet.connect(user1)["execute(address,bytes)"](gmx.address, transferData)).to.be.reverted;
    });

    it("can receive ETH", async () => {
      await user0.sendTransaction({ to: walletAddress, value: expandDecimals(1, 18) });
      const balance = await hre.ethers.provider.getBalance(walletAddress);
      expect(balance).to.equal(expandDecimals(1, 18));
    });

    it("returns data from successful calls", async () => {
      await grantRole(roleStore, user1.address, "CONTROLLER");

      await gmx.mint(walletAddress, expandDecimals(100, 18));

      // Call balanceOf through wallet execute
      const balanceOfData = gmx.interface.encodeFunctionData("balanceOf", [walletAddress]);
      const result = await wallet.connect(user1).callStatic["execute(address,bytes)"](gmx.address, balanceOfData);

      const decoded = gmx.interface.decodeFunctionResult("balanceOf", result);
      expect(decoded[0]).to.equal(expandDecimals(100, 18));
    });
  });
});
