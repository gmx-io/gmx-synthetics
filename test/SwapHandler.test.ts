import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer } from "ethers";

import { RoleStore, SwapHandler } from "../typechain-types";

describe("SwapHandler", function () {
  let deployer: Signer;
  let controller: Signer;
  let user: Signer;

  let roleStore: RoleStore;
  let swapHandler: SwapHandler;

  beforeEach(async () => {
    const signers = await ethers.getSigners();
    deployer = signers[0];
    controller = signers[1];
    user = signers[2];

    // Deploy RoleStore (assumed already implemented in your repo)
    const RoleStoreFactory = await ethers.getContractFactory("RoleStore");
    roleStore = (await RoleStoreFactory.deploy()) as RoleStore;
    await roleStore.deployed();

    // Grant CONTROLLER role to controller
    await roleStore
      .connect(deployer)
      .grantRole(ethers.utils.id("CONTROLLER"), await controller.getAddress());

    // Deploy SwapHandler
    const SwapHandlerFactory = await ethers.getContractFactory("SwapHandler");
    swapHandler = (await SwapHandlerFactory.deploy(
      roleStore.address
    )) as SwapHandler;
    await swapHandler.deployed();
  });

  it("should allow controller to call swap()", async () => {
    // Example SwapParams (adapt fields to your actual SwapUtils definition)
    const params = {
      tokenIn: ethers.constants.AddressZero,
      tokenOut: ethers.constants.AddressZero,
      amountIn: ethers.utils.parseEther("1"),
      minAmountOut: 0,
      receiver: await (await user).getAddress(),
    };

    // Call swap as controller
    const tx = await swapHandler.connect(controller).swap(params);
    await tx.wait();

    // Example: check if event emitted (replace with your actual event)
    // expect(tx).to.emit(swapHandler, "SwapExecuted");
  });

  it("should revert if non-controller calls swap()", async () => {
    const params = {
      tokenIn: ethers.constants.AddressZero,
      tokenOut: ethers.constants.AddressZero,
      amountIn: ethers.utils.parseEther("1"),
      minAmountOut: 0,
      receiver: await (await user).getAddress(),
    };

    await expect(
      swapHandler.connect(user).swap(params)
    ).to.be.revertedWith("Unauthorized"); // Adjust to your RoleModule revert msg
  });
});
