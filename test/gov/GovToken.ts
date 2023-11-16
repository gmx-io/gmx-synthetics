import hre from "hardhat";
import { expect } from "chai";

import { deployContract } from "../../utils/deploy";
import { errorsContract } from "../../utils/error";
import { hashString } from "../../utils/hash";

describe("GovToken", () => {
  const { provider } = ethers;
  let roleStore, govToken;
  let wallet, user0, user1, user2, user3;

  beforeEach(async () => {
    roleStore = await deployContract("RoleStore", []);
    govToken = await deployContract("GovToken", [roleStore.address, "GovToken", "GT", 18]);
    const accountList = await hre.ethers.getSigners();
    [wallet, user0, user1, user2, user3] = accountList;

    await roleStore.connect(wallet).grantRole(wallet.address, hashString("GOV_TOKEN_CONTROLLER"));
  });

  it("initializes", async () => {
    expect(await govToken.roleStore()).eq(roleStore.address);
    expect(await govToken.name()).eq("GovToken");
    expect(await govToken.symbol()).eq("GT");
    expect(await govToken.decimals()).eq(18);
  });

  it("uses timestamp for clock", async () => {
    const block = await provider.getBlock();
    expect(await govToken.clock()).eq(block.timestamp);
    expect(await govToken.CLOCK_MODE()).eq("mode=timestamp");
  });

  it("mint", async () => {
    await expect(govToken.connect(user0).mint(user1.address, 100)).to.be.revertedWithCustomError(
      errorsContract,
      "Unauthorized"
    );

    expect(await govToken.balanceOf(user1.address)).eq(0);
    await roleStore.connect(wallet).grantRole(user0.address, hashString("GOV_TOKEN_CONTROLLER"));

    await govToken.connect(user0).mint(user1.address, 100);
    expect(await govToken.balanceOf(user1.address)).eq(100);
  });

  it("burn", async () => {
    await govToken.connect(wallet).mint(user1.address, 100);

    await expect(govToken.connect(user0).burn(user1.address, 25)).to.be.revertedWithCustomError(
      errorsContract,
      "Unauthorized"
    );

    expect(await govToken.balanceOf(user1.address)).eq(100);
    await roleStore.connect(wallet).grantRole(user0.address, hashString("GOV_TOKEN_CONTROLLER"));

    await govToken.connect(user0).burn(user1.address, 25);
    expect(await govToken.balanceOf(user1.address)).eq(75);
  });

  it("transfer", async () => {
    await govToken.connect(wallet).mint(user1.address, 100);

    await expect(govToken.connect(user1).transfer(user2.address, 10)).to.be.revertedWithCustomError(
      errorsContract,
      "Unauthorized"
    );

    await roleStore.connect(wallet).grantRole(user1.address, hashString("GOV_TOKEN_CONTROLLER"));

    expect(await govToken.balanceOf(user1.address)).eq(100);
    expect(await govToken.balanceOf(user2.address)).eq(0);

    await govToken.connect(user1).transfer(user2.address, 10);

    expect(await govToken.balanceOf(user1.address)).eq(90);
    expect(await govToken.balanceOf(user2.address)).eq(10);
  });

  it("transferFrom", async () => {
    await govToken.connect(wallet).mint(user1.address, 100);

    await expect(govToken.connect(user0).transferFrom(user1.address, user2.address, 10)).to.be.revertedWith(
      "ERC20: insufficient allowance"
    );

    await govToken.connect(user1).approve(user0.address, 20);

    await expect(govToken.connect(user0).transferFrom(user1.address, user2.address, 10)).to.be.revertedWithCustomError(
      errorsContract,
      "Unauthorized"
    );

    await roleStore.connect(wallet).grantRole(user0.address, hashString("GOV_TOKEN_CONTROLLER"));

    expect(await govToken.balanceOf(user1.address)).eq(100);
    expect(await govToken.balanceOf(user2.address)).eq(0);

    await govToken.connect(user0).transferFrom(user1.address, user2.address, 10);

    expect(await govToken.balanceOf(user1.address)).eq(90);
    expect(await govToken.balanceOf(user2.address)).eq(10);
  });

  it("delegate", async () => {
    await govToken.connect(wallet).mint(user0.address, 100);
    await govToken.connect(user0).delegate(user2.address);
    expect(await govToken.numCheckpoints(user0.address)).eq(0);
    expect(await govToken.numCheckpoints(user2.address)).eq(1);

    expect(await govToken.getVotes(user0.address)).eq(0);
    expect(await govToken.getVotes(user1.address)).eq(0);
    expect(await govToken.getVotes(user2.address)).eq(100);
    expect(await govToken.getVotes(user3.address)).eq(0);

    await govToken.connect(wallet).mint(user1.address, 50);
    await govToken.connect(user1).delegate(user2.address);

    expect(await govToken.getVotes(user0.address)).eq(0);
    expect(await govToken.getVotes(user1.address)).eq(0);
    expect(await govToken.getVotes(user2.address)).eq(150);
    expect(await govToken.getVotes(user3.address)).eq(0);

    await govToken.connect(user1).delegate(user3.address);

    expect(await govToken.getVotes(user0.address)).eq(0);
    expect(await govToken.getVotes(user1.address)).eq(0);
    expect(await govToken.getVotes(user2.address)).eq(100);
    expect(await govToken.getVotes(user3.address)).eq(50);

    await govToken.connect(wallet).burn(user0.address, 10);

    expect(await govToken.getVotes(user0.address)).eq(0);
    expect(await govToken.getVotes(user1.address)).eq(0);
    expect(await govToken.getVotes(user2.address)).eq(90);
    expect(await govToken.getVotes(user3.address)).eq(50);

    await govToken.connect(user0).approve(wallet.address, 20);

    await govToken.connect(wallet).transferFrom(user0.address, user1.address, 10);

    expect(await govToken.getVotes(user0.address)).eq(0);
    expect(await govToken.getVotes(user1.address)).eq(0);
    expect(await govToken.getVotes(user2.address)).eq(80);
    expect(await govToken.getVotes(user3.address)).eq(60);

    await govToken.connect(wallet).mint(user0.address, 5);

    expect(await govToken.getVotes(user0.address)).eq(0);
    expect(await govToken.getVotes(user1.address)).eq(0);
    expect(await govToken.getVotes(user2.address)).eq(85);
    expect(await govToken.getVotes(user3.address)).eq(60);
  });
});
