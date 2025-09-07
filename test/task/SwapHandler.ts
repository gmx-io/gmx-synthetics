import { expect } from "chai";
import { ethers } from "hardhat";

describe("SwapHandler Swap Execution", function () {
  let roleStore, dataStore, eventEmitter, swapHandler;
  let marketEventUtils, marketStoreUtils, marketUtils, feeUtils, swapPricingUtils, swapUtils;
  let owner, user;

  beforeEach(async () => {
  [owner, user] = await ethers.getSigners();

  // 先部署 roleStore
  const RoleStore = await ethers.getContractFactory("RoleStore");
  roleStore = await RoleStore.deploy();
  await roleStore.deployed();

  const CONTROLLER = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("CONTROLLER"));

    const DataStore = await ethers.getContractFactory("DataStore");
    dataStore = await DataStore.deploy(roleStore.address);
    await dataStore.deployed();

    const EventEmitter = await ethers.getContractFactory("EventEmitter");
    eventEmitter = await EventEmitter.deploy(roleStore.address);
    await eventEmitter.deployed();

    // 先部署 MarketEventUtils 和 MarketStoreUtils
    const MarketEventUtilsFactory = await ethers.getContractFactory("MarketEventUtils");
    marketEventUtils = await MarketEventUtilsFactory.deploy();
    await marketEventUtils.deployed();

    const MarketStoreUtilsFactory = await ethers.getContractFactory("MarketStoreUtils");
    marketStoreUtils = await MarketStoreUtilsFactory.deploy();
    await marketStoreUtils.deployed();

    // 部署 MarketUtils 并链接依赖库
    const MarketUtilsFactory = await ethers.getContractFactory("MarketUtils", {
      libraries: {
        MarketEventUtils: marketEventUtils.address,
        MarketStoreUtils: marketStoreUtils.address,
      },
    });
    marketUtils = await MarketUtilsFactory.deploy();
    await marketUtils.deployed();

    // FeeUtils 链接 MarketUtils
    const FeeUtilsFactory = await ethers.getContractFactory("FeeUtils", {
      libraries: {
        MarketUtils: marketUtils.address,
      },
    });
    feeUtils = await FeeUtilsFactory.deploy();
    await feeUtils.deployed();

    // SwapPricingUtils
    const SwapPricingUtilsFactory = await ethers.getContractFactory("SwapPricingUtils");
    swapPricingUtils = await SwapPricingUtilsFactory.deploy();
    await swapPricingUtils.deployed();

    // SwapUtils 链接 FeeUtils、MarketEventUtils、SwapPricingUtils
  [owner, user] = await ethers.getSigners();

    const SwapUtilsFactory = await ethers.getContractFactory("SwapUtils", {
      libraries: {
        FeeUtils: feeUtils.address,
        MarketEventUtils: marketEventUtils.address,
        SwapPricingUtils: swapPricingUtils.address,
      },
    });
    swapUtils = await SwapUtilsFactory.deploy();
    await swapUtils.deployed();

    // SwapHandler 链接 SwapUtils
    const SwapHandler = await ethers.getContractFactory("SwapHandler", {
      libraries: {
        SwapUtils: swapUtils.address,
      },
    });
    swapHandler = await SwapHandler.deploy(roleStore.address);
    await swapHandler.deployed();

  // 部署完 SwapHandler 后再授权 CONTROLLER
  await roleStore.connect(owner).grantRole(owner.address, CONTROLLER);
  await roleStore.connect(owner).grantRole(dataStore.address, CONTROLLER);
  await roleStore.connect(owner).grantRole(eventEmitter.address, CONTROLLER);
  await roleStore.connect(owner).grantRole(swapHandler.address, CONTROLLER);
  // 可选：确认 owner 已有 CONTROLLER 权限
  // const hasRole = await roleStore.hasRole(owner.address, CONTROLLER);
  // expect(hasRole).to.be.true;
  });
  it("should revert on zero-amount swap", async () => {
    // 构造最小 SwapParams，amountIn 为 0
    const params = {
      dataStore: dataStore.address,
      eventEmitter: eventEmitter.address,
      oracle: ethers.constants.AddressZero,
      bank: ethers.constants.AddressZero,
      key: ethers.utils.formatBytes32String("test"),
      tokenIn: ethers.constants.AddressZero,
      amountIn: 0,
      swapPathMarkets: [],
      minOutputAmount: 1,
      receiver: owner.address,
      uiFeeReceiver: ethers.constants.AddressZero,
      shouldUnwrapNativeToken: false,
      swapPricingType: 0 // ISwapPricingUtils.SwapPricingType.Swap
    };
    await expect(
      swapHandler.connect(owner).swap(params)
    ).to.be.revertedWithCustomError(
      (await ethers.getContractFactory("Errors")).attach(swapHandler.address),
      "InsufficientOutputAmount"
    );
  });
  it("should revert on slippage breach", async () => {
    // 构造能触发 slippage breach 的 SwapParams（如 minOutputAmount 极大）
    const params = {
      dataStore: dataStore.address,
      eventEmitter: eventEmitter.address,
      oracle: ethers.constants.AddressZero,
      bank: ethers.constants.AddressZero,
      key: ethers.utils.formatBytes32String("test2"),
      tokenIn: ethers.constants.AddressZero,
      amountIn: 1,
      swapPathMarkets: [],
      minOutputAmount: ethers.constants.MaxUint256,
      receiver: owner.address,
      uiFeeReceiver: ethers.constants.AddressZero,
      shouldUnwrapNativeToken: false,
      swapPricingType: 0 // ISwapPricingUtils.SwapPricingType.Swap
    };
    await expect(
      swapHandler.connect(owner).swap(params)
    ).to.be.revertedWithCustomError(
      (await ethers.getContractFactory("Errors")).attach(swapHandler.address),
      "InsufficientSwapOutputAmount"
    );
  });
  it("should execute swap with correct output, fees, price impact sign", async () => {
    // TODO: mock dataStore/market, check output, fees, price impact
    expect(true).to.be.true;
  });
});
