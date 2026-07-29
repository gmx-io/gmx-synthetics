import { expect } from "chai";
import { ethers } from "hardhat";

import { deployContract } from "../../../utils/deploy";
import { deployFixture } from "../../../utils/fixture";
import { errorsContract } from "../../../utils/error";
import { grantRole } from "../../../utils/role";

describe("EIP6492Deployer", () => {
  let fixture;
  let user0, user1;
  let roleStore;
  let eip6492Deployer, walletFactory;
  let walletAddress, createWalletCalldata;

  beforeEach(async () => {
    fixture = await deployFixture();
    ({ user0, user1 } = fixture.accounts);
    ({ roleStore } = fixture.contracts);

    eip6492Deployer = await ethers.getContract("EIP6492Deployer");

    walletFactory = await deployContract("MockERC1271WalletFactory", []);
    const salt = ethers.utils.formatBytes32String("wallet");
    walletAddress = await walletFactory.getWalletAddress(user0.address, salt);
    createWalletCalldata = walletFactory.interface.encodeFunctionData("createWallet", [user0.address, salt]);
  });

  it("rejects a caller without the CONTROLLER role", async () => {
    await expect(eip6492Deployer.connect(user1).deploy(walletFactory.address, createWalletCalldata))
      .to.be.revertedWithCustomError(errorsContract, "Unauthorized")
      .withArgs(user1.address, "CONTROLLER");

    expect(await ethers.provider.getCode(walletAddress)).eq("0x");
  });

  it("calls the factory for a caller with the CONTROLLER role", async () => {
    expect(await ethers.provider.getCode(walletAddress)).eq("0x");

    await grantRole(roleStore, user1.address, "CONTROLLER");
    await eip6492Deployer.connect(user1).deploy(walletFactory.address, createWalletCalldata);

    expect(await ethers.provider.getCode(walletAddress)).not.eq("0x");
    const wallet = await ethers.getContractAt("MockERC1271Wallet", walletAddress);
    expect(await wallet.owner()).eq(user0.address);
  });

  it("holds no roles", async () => {
    const roleCount = await roleStore.getRoleCount();
    const roles = await roleStore.getRoles(0, roleCount);
    for (const role of roles) {
      expect(await roleStore.hasRole(eip6492Deployer.address, role), `role ${role}`).eq(false);
    }
  });
});
