import { expect } from "chai";
import { ethers } from "hardhat";

describe("MarketUtils Swap Execution", function () {
  // ...existing setup code...
    let marketUtilsTest;
    let dataStore;
    let eventEmitter;
    let roleStore;
    let owner, user;

    beforeEach(async () => {
  [owner, user] = await ethers.getSigners();
  const RoleStore = await ethers.getContractFactory("RoleStore");
  roleStore = await RoleStore.deploy();
  await roleStore.deployed();

  const DataStore = await ethers.getContractFactory("DataStore");
  dataStore = await DataStore.deploy(roleStore.address);
  await dataStore.deployed();

  const EventEmitter = await ethers.getContractFactory("EventEmitter");
  eventEmitter = await EventEmitter.deploy(roleStore.address);
  await eventEmitter.deployed();

      // 部署 MarketStoreUtils 库
      const MarketStoreUtils = await ethers.getContractFactory("MarketStoreUtils");
      const marketStoreUtils = await MarketStoreUtils.deploy();
      await marketStoreUtils.deployed();

      // 链接库后部署 MarketUtilsTest
      const MarketUtilsTest = await ethers.getContractFactory("MarketUtilsTest", {
        libraries: {
          MarketStoreUtils: marketStoreUtils.address,
        },
      });
      marketUtilsTest = await MarketUtilsTest.deploy();
      await marketUtilsTest.deployed();
    });

    it("should revert on invalid swap market", async () => {
      // Call validateSwapMarket with invalid params to trigger revert
      // For example, pass zero address for market or invalid token addresses
      await expect(
        marketUtilsTest.validateSwapMarket(
          dataStore.address,
          ethers.constants.AddressZero, // invalid market address
          ethers.constants.AddressZero, // invalid tokenIn
          ethers.constants.AddressZero  // invalid tokenOut
        )
      ).to.be.reverted;
    });

    it("should revert on getOppositeToken with invalid input", async () => {
      // Call getOppositeToken with invalid params to trigger revert
      let failed = false;
      try {
        await marketUtilsTest.getOppositeToken(
          dataStore.address,
          ethers.constants.AddressZero, // invalid market address
          "0x0000000000000000000000000000000000000001" // 非零 token 地址，确保触发 revert
        );
      } catch (e) {
        failed = true;
        expect(e.message).to.include("UnableToGetOppositeToken");
      }
      expect(failed).to.be.true;
    });
});
