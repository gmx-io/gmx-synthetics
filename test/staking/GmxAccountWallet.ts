import { expect } from "chai";
import { deployFixture } from "../../utils/fixture";
import { deployContract } from "../../utils/deploy";
import { grantRole } from "../../utils/role";
import { expandDecimals } from "../../utils/math";
import { errorsContract } from "../../utils/error";
import { parseLogs, getEventData, getEventDataArray } from "../../utils/event";
import * as keys from "../../utils/keys";

describe("GmxAccountWallet", () => {
  let fixture;
  let user0, user1, user2;
  let roleStore, dataStore, eventEmitter, gmxAccountWalletFactory, gmx;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1, user2 } = fixture.accounts);
    ({ roleStore, dataStore, eventEmitter, gmxAccountWalletFactory, gmx } = fixture.contracts);
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

      // Should emit exactly one GmxAccountWalletCreated and one GmxAccountWalletMapped event
      const parsedLogs = parseLogs(fixture, receipt);

      const createdEvents = getEventDataArray(parsedLogs, "GmxAccountWalletCreated");
      expect(createdEvents.length).to.equal(1);
      expect(createdEvents[0].account).to.equal(user0.address);
      expect(createdEvents[0].wallet).to.equal(predictedAddr);

      const mappedEvents = getEventDataArray(parsedLogs, "GmxAccountWalletMapped");
      expect(mappedEvents.length).to.equal(1);
      expect(mappedEvents[0].account).to.equal(user0.address);
      expect(mappedEvents[0].wallet).to.equal(predictedAddr);
    });

    it("returns existing wallet on subsequent calls without creating new one", async () => {
      const addr1 = await gmxAccountWalletFactory.callStatic.getOrCreateWallet(user0.address);
      await gmxAccountWalletFactory.getOrCreateWallet(user0.address);

      const addr2 = await gmxAccountWalletFactory.callStatic.getOrCreateWallet(user0.address);
      expect(addr1).to.equal(addr2);
    });

    it("wallet is not marked as deployed before creation", async () => {
      const predicted = await gmxAccountWalletFactory.getWalletAddress(user0.address);
      expect(await dataStore.getBool(keys.isDeployedWalletKey(predicted))).to.be.false;
    });

    it("wallet is marked as deployed after creation", async () => {
      await gmxAccountWalletFactory.getOrCreateWallet(user0.address);
      const predicted = await gmxAccountWalletFactory.getWalletAddress(user0.address);
      expect(await dataStore.getBool(keys.isDeployedWalletKey(predicted))).to.be.true;
    });

    it("exposes the wallet init code hash used in the address derivation", async () => {
      const walletArtifact = await hre.artifacts.readArtifact("GmxAccountWallet");
      const initCode =
        walletArtifact.bytecode + hre.ethers.utils.defaultAbiCoder.encode(["address"], [roleStore.address]).slice(2);
      const initCodeHash = hre.ethers.utils.keccak256(initCode);

      expect(await gmxAccountWalletFactory.walletInitCodeHash()).to.equal(initCodeHash);

      // the same recipe integrators use off-chain
      const salt = hre.ethers.utils.keccak256(
        hre.ethers.utils.defaultAbiCoder.encode(["string", "address"], ["GMX_ACCOUNT_WALLET", user0.address])
      );
      const derived = hre.ethers.utils.getCreate2Address(gmxAccountWalletFactory.address, salt, initCodeHash);
      expect(await gmxAccountWalletFactory.getWalletAddress(user0.address)).to.equal(derived);
    });
  });

  describe("wallet registry", () => {
    it("getWallet returns zero before creation", async () => {
      expect(await gmxAccountWalletFactory.getWallet(user0.address)).to.equal(hre.ethers.constants.AddressZero);
    });

    it("records the account wallet on creation", async () => {
      const wallet = await gmxAccountWalletFactory.callStatic.getOrCreateWallet(user0.address);
      await gmxAccountWalletFactory.getOrCreateWallet(user0.address);

      expect(await gmxAccountWalletFactory.getWallet(user0.address)).to.equal(wallet);
      expect(await dataStore.getAddress(keys.accountWalletKey(user0.address))).to.equal(wallet);

      // within one factory deployment the record always equals the derived address;
      // they only diverge after a factory replacement
      expect(await gmxAccountWalletFactory.getWallet(user0.address)).to.equal(
        await gmxAccountWalletFactory.getWalletAddress(user0.address)
      );
    });

    it("emits no events when the wallet already exists", async () => {
      await gmxAccountWalletFactory.getOrCreateWallet(user0.address);

      const tx = await gmxAccountWalletFactory.getOrCreateWallet(user0.address);
      const receipt = await tx.wait();
      const parsedLogs = parseLogs(fixture, receipt);

      expect(getEventData(parsedLogs, "GmxAccountWalletCreated")).to.be.undefined;
      expect(getEventData(parsedLogs, "GmxAccountWalletMapped")).to.be.undefined;
    });

    it("reverts if the recorded wallet is not marked as deployed", async () => {
      const wallet = await gmxAccountWalletFactory.callStatic.getOrCreateWallet(user0.address);
      await gmxAccountWalletFactory.getOrCreateWallet(user0.address);

      await grantRole(roleStore, user1.address, "CONTROLLER");
      await dataStore.connect(user1).setBool(keys.isDeployedWalletKey(wallet), false);

      await expect(gmxAccountWalletFactory.getOrCreateWallet(user0.address))
        .to.be.revertedWithCustomError(errorsContract, "InvalidWallet")
        .withArgs(wallet);
    });

    it("restores the record if it was removed while the wallet exists", async () => {
      const wallet = await gmxAccountWalletFactory.callStatic.getOrCreateWallet(user0.address);
      await gmxAccountWalletFactory.getOrCreateWallet(user0.address);

      // only a direct DataStore write can remove the record, e.g. buggy migration tooling
      await grantRole(roleStore, user1.address, "CONTROLLER");
      await dataStore.connect(user1).setAddress(keys.accountWalletKey(user0.address), hre.ethers.constants.AddressZero);
      expect(await gmxAccountWalletFactory.getWallet(user0.address)).to.equal(hre.ethers.constants.AddressZero);

      expect(await gmxAccountWalletFactory.callStatic.getOrCreateWallet(user0.address)).to.equal(wallet);

      const tx = await gmxAccountWalletFactory.getOrCreateWallet(user0.address);
      const receipt = await tx.wait();
      const parsedLogs = parseLogs(fixture, receipt);

      // the wallet is not re-created, only the record is written again
      expect(getEventData(parsedLogs, "GmxAccountWalletCreated")).to.be.undefined;
      const mappedEvent = getEventData(parsedLogs, "GmxAccountWalletMapped");
      expect(mappedEvent.account).to.equal(user0.address);
      expect(mappedEvent.wallet).to.equal(wallet);

      expect(await gmxAccountWalletFactory.getWallet(user0.address)).to.equal(wallet);
    });

    it("reverts if the derived wallet exists but is not marked as deployed", async () => {
      const wallet = await gmxAccountWalletFactory.callStatic.getOrCreateWallet(user0.address);
      await gmxAccountWalletFactory.getOrCreateWallet(user0.address);

      await grantRole(roleStore, user1.address, "CONTROLLER");
      await dataStore.connect(user1).setAddress(keys.accountWalletKey(user0.address), hre.ethers.constants.AddressZero);
      await dataStore.connect(user1).setBool(keys.isDeployedWalletKey(wallet), false);

      await expect(gmxAccountWalletFactory.getOrCreateWallet(user0.address))
        .to.be.revertedWithCustomError(errorsContract, "InvalidWallet")
        .withArgs(wallet);
    });

    it("a replacement factory returns the recorded wallet instead of creating a second one", async () => {
      const wallet1 = await gmxAccountWalletFactory.callStatic.getOrCreateWallet(user0.address);
      await gmxAccountWalletFactory.getOrCreateWallet(user0.address);

      const factory2 = await deployContract("GmxAccountWalletFactory", [
        roleStore.address,
        dataStore.address,
        eventEmitter.address,
      ]);
      await grantRole(roleStore, factory2.address, "CONTROLLER");

      // the replacement factory derives a different address for the same account
      const predicted2 = await factory2.getWalletAddress(user0.address);
      expect(predicted2).to.not.equal(wallet1);

      // but resolves the account to the recorded wallet and creates nothing
      expect(await factory2.callStatic.getOrCreateWallet(user0.address)).to.equal(wallet1);

      const tx = await factory2.getOrCreateWallet(user0.address);
      const receipt = await tx.wait();
      const parsedLogs = parseLogs(fixture, receipt);
      expect(getEventData(parsedLogs, "GmxAccountWalletCreated")).to.be.undefined;
      expect(await hre.ethers.provider.getCode(predicted2)).to.equal("0x");

      // accounts without a wallet are unaffected: they get one from the new factory
      const wallet2 = await factory2.callStatic.getOrCreateWallet(user1.address);
      await factory2.getOrCreateWallet(user1.address);
      expect(wallet2).to.not.equal(wallet1);
      expect(await factory2.getWallet(user1.address)).to.equal(wallet2);
      expect(await hre.ethers.provider.getCode(wallet2)).to.not.equal("0x");
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
