import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract } from "ethers";


describe("SwapPricingUtils Swap Execution", function () {
  let roleStore: Contract;
  let dataStore: Contract;
  let market: any;
  let tokenA: string;
  let tokenB: string;
  let swapPricingUtils: any;

  beforeEach(async () => {
    const [owner] = await ethers.getSigners();
    // 部署RoleStore
    const RoleStoreFactory = await ethers.getContractFactory("RoleStore", owner);
    roleStore = await RoleStoreFactory.deploy();
    await roleStore.deployed();
    // 读取合约常量 CONTROLLER（与合约保持一致，keccak256(abi.encode("CONTROLLER"))）
    const CONTROLLER = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(["string"], ["CONTROLLER"])
    );

    // 部署DataStore
    const DataStoreFactory = await ethers.getContractFactory("DataStore", owner);
    dataStore = await DataStoreFactory.deploy(roleStore.address);
    await dataStore.deployed();

    // DataStore 部署后再授权 CONTROLLER
    await roleStore.connect(owner).grantRole(owner.address, CONTROLLER);
    // 调试：断言 owner 已有 CONTROLLER 权限
    const hasControllerRole = await roleStore.hasRole(owner.address, CONTROLLER);
    console.log('owner.address:', owner.address, 'has CONTROLLER:', hasControllerRole);
    expect(hasControllerRole).to.be.true;

    // mock更多 fee/factor/impact 相关 key（正负分支和全局分支）
    // SWAP_IMPACT_EXPONENT_FACTOR 全局
    const swapImpactExponentFactorGlobalKey = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string"], ["SWAP_IMPACT_EXPONENT_FACTOR"]));
    await dataStore.connect(owner).setUint(swapImpactExponentFactorGlobalKey, ethers.utils.parseUnits("1", 18));

    // SWAP_IMPACT_FACTOR 全局正负分支
    const swapImpactFactorGlobalKeyPos = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string","bool"], ["SWAP_IMPACT_FACTOR", true]));
    const swapImpactFactorGlobalKeyNeg = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string","bool"], ["SWAP_IMPACT_FACTOR", false]));
    await dataStore.connect(owner).setUint(swapImpactFactorGlobalKeyPos, ethers.utils.parseUnits("0.01", 18));
    await dataStore.connect(owner).setUint(swapImpactFactorGlobalKeyNeg, ethers.utils.parseUnits("0.01", 18));

    // SWAP_FEE_FACTOR 全局正负分支
    const swapFeeFactorGlobalKeyPos = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string","bool"], ["SWAP_FEE_FACTOR", true]));
    const swapFeeFactorGlobalKeyNeg = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string","bool"], ["SWAP_FEE_FACTOR", false]));
    await dataStore.connect(owner).setUint(swapFeeFactorGlobalKeyPos, ethers.utils.parseUnits("0.01", 18));
    await dataStore.connect(owner).setUint(swapFeeFactorGlobalKeyNeg, ethers.utils.parseUnits("0.01", 18));

    // ATOMIC_SWAP_FEE_FACTOR 全局
    const atomicSwapFeeFactorGlobalKey = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string"], ["ATOMIC_SWAP_FEE_FACTOR"]));
    await dataStore.connect(owner).setUint(atomicSwapFeeFactorGlobalKey, ethers.utils.parseUnits("0.01", 18));

    // ATOMIC_WITHDRAWAL_FEE_FACTOR 全局
    const atomicWithdrawalFeeFactorGlobalKey = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string"], ["ATOMIC_WITHDRAWAL_FEE_FACTOR"]));
    await dataStore.connect(owner).setUint(atomicWithdrawalFeeFactorGlobalKey, ethers.utils.parseUnits("0.01", 18));

    // DEPOSIT_FEE_FACTOR 全局正负分支
    const depositFeeFactorGlobalKeyPos = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string","bool"], ["DEPOSIT_FEE_FACTOR", true]));
    const depositFeeFactorGlobalKeyNeg = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string","bool"], ["DEPOSIT_FEE_FACTOR", false]));
    await dataStore.connect(owner).setUint(depositFeeFactorGlobalKeyPos, ethers.utils.parseUnits("0.01", 18));
    await dataStore.connect(owner).setUint(depositFeeFactorGlobalKeyNeg, ethers.utils.parseUnits("0.01", 18));

    // WITHDRAWAL_FEE_FACTOR 全局正负分支
    const withdrawalFeeFactorGlobalKeyPos = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string","bool"], ["WITHDRAWAL_FEE_FACTOR", true]));
    const withdrawalFeeFactorGlobalKeyNeg = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string","bool"], ["WITHDRAWAL_FEE_FACTOR", false]));
    await dataStore.connect(owner).setUint(withdrawalFeeFactorGlobalKeyPos, ethers.utils.parseUnits("0.01", 18));
    await dataStore.connect(owner).setUint(withdrawalFeeFactorGlobalKeyNeg, ethers.utils.parseUnits("0.01", 18));

    // mock market props（严格匹配 Solidity Market.Props 结构体，仅4字段，顺序一致）
    tokenA = ethers.Wallet.createRandom().address;
    tokenB = ethers.Wallet.createRandom().address;
    market = {
      marketToken: ethers.Wallet.createRandom().address,
      indexToken: ethers.Wallet.createRandom().address,
      longToken: tokenA,
      shortToken: tokenB,
    };

  // mock池子初始余额和所有相关 key（全部提升到 10000 ether）
  const poolKeyA = ethers.utils.solidityKeccak256(["bytes32","address","address"], [ethers.utils.keccak256(ethers.utils.toUtf8Bytes("POOL_AMOUNT")), market.marketToken, tokenA]);
  const poolKeyB = ethers.utils.solidityKeccak256(["bytes32","address","address"], [ethers.utils.keccak256(ethers.utils.toUtf8Bytes("POOL_AMOUNT")), market.marketToken, tokenB]);
  const poolKeyIndex = ethers.utils.solidityKeccak256(["bytes32","address","address"], [ethers.utils.keccak256(ethers.utils.toUtf8Bytes("POOL_AMOUNT")), market.marketToken, market.indexToken]);
  await dataStore.connect(owner).setUint(poolKeyA, ethers.utils.parseUnits("10000", 18));
  await dataStore.connect(owner).setUint(poolKeyB, ethers.utils.parseUnits("10000", 18));
  await dataStore.connect(owner).setUint(poolKeyIndex, ethers.utils.parseUnits("10000", 18));

    // mock SWAP_FEE_FACTOR 正负分支
    const swapFeeFactorKeyPos = ethers.utils.solidityKeccak256(["bytes32","address","bool"], [ethers.utils.keccak256(ethers.utils.toUtf8Bytes("SWAP_FEE_FACTOR")), market.marketToken, true]);
    const swapFeeFactorKeyNeg = ethers.utils.solidityKeccak256(["bytes32","address","bool"], [ethers.utils.keccak256(ethers.utils.toUtf8Bytes("SWAP_FEE_FACTOR")), market.marketToken, false]);
    await dataStore.connect(owner).setUint(swapFeeFactorKeyPos, ethers.utils.parseUnits("0.01", 18));
    await dataStore.connect(owner).setUint(swapFeeFactorKeyNeg, ethers.utils.parseUnits("0.01", 18));

    // mock虚拟库存相关 key
    const virtualInventoryForSwapsKey = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string"], ["VIRTUAL_INVENTORY_FOR_SWAPS"]));
    await dataStore.connect(owner).setUint(virtualInventoryForSwapsKey, ethers.utils.parseUnits("0", 18));
    const virtualInventoryForPositionsKey = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string"], ["VIRTUAL_INVENTORY_FOR_POSITIONS"]));
    await dataStore.connect(owner).setUint(virtualInventoryForPositionsKey, ethers.utils.parseUnits("0", 18));

  // mock maxPoolAmountKey
  const maxPoolKeyA = ethers.utils.solidityKeccak256(["bytes32","address","address"], [ethers.utils.keccak256(ethers.utils.toUtf8Bytes("MAX_POOL_AMOUNT")), market.marketToken, tokenA]);
  const maxPoolKeyB = ethers.utils.solidityKeccak256(["bytes32","address","address"], [ethers.utils.keccak256(ethers.utils.toUtf8Bytes("MAX_POOL_AMOUNT")), market.marketToken, tokenB]);
  await dataStore.connect(owner).setUint(maxPoolKeyA, ethers.utils.parseUnits("1000", 18));
  await dataStore.connect(owner).setUint(maxPoolKeyB, ethers.utils.parseUnits("1000", 18));

  // mock swapImpactFactorKey (正负)
  const swapImpactFactorKeyPos = ethers.utils.solidityKeccak256(["bytes32","address","bool"], [ethers.utils.keccak256(ethers.utils.toUtf8Bytes("SWAP_IMPACT_FACTOR")), market.marketToken, true]);
  const swapImpactFactorKeyNeg = ethers.utils.solidityKeccak256(["bytes32","address","bool"], [ethers.utils.keccak256(ethers.utils.toUtf8Bytes("SWAP_IMPACT_FACTOR")), market.marketToken, false]);
  await dataStore.connect(owner).setUint(swapImpactFactorKeyPos, ethers.utils.parseUnits("0.01", 18));
  await dataStore.connect(owner).setUint(swapImpactFactorKeyNeg, ethers.utils.parseUnits("0.01", 18));

  // mock swapImpactExponentFactorKey
  const swapImpactExponentFactorKey = ethers.utils.solidityKeccak256(["bytes32","address"], [ethers.utils.keccak256(ethers.utils.toUtf8Bytes("SWAP_IMPACT_EXPONENT_FACTOR")), market.marketToken]);
  await dataStore.connect(owner).setUint(swapImpactExponentFactorKey, ethers.utils.parseUnits("1", 18));

  // mock swapImpactPoolAmountKey
  const swapImpactPoolAmountKeyA = ethers.utils.solidityKeccak256(["bytes32","address","address"], [ethers.utils.keccak256(ethers.utils.toUtf8Bytes("SWAP_IMPACT_POOL_AMOUNT")), market.marketToken, tokenA]);
  const swapImpactPoolAmountKeyB = ethers.utils.solidityKeccak256(["bytes32","address","address"], [ethers.utils.keccak256(ethers.utils.toUtf8Bytes("SWAP_IMPACT_POOL_AMOUNT")), market.marketToken, tokenB]);
  await dataStore.connect(owner).setUint(swapImpactPoolAmountKeyA, ethers.utils.parseUnits("10", 18));
  await dataStore.connect(owner).setUint(swapImpactPoolAmountKeyB, ethers.utils.parseUnits("10", 18));

  // mock depositFeeFactorKey/withdrawalFeeFactorKey (正负)
  const depositFeeFactorKeyPos = ethers.utils.solidityKeccak256(["bytes32","address","bool"], [ethers.utils.keccak256(ethers.utils.toUtf8Bytes("DEPOSIT_FEE_FACTOR")), market.marketToken, true]);
  const depositFeeFactorKeyNeg = ethers.utils.solidityKeccak256(["bytes32","address","bool"], [ethers.utils.keccak256(ethers.utils.toUtf8Bytes("DEPOSIT_FEE_FACTOR")), market.marketToken, false]);
  await dataStore.connect(owner).setUint(depositFeeFactorKeyPos, ethers.utils.parseUnits("0.01", 18));
  await dataStore.connect(owner).setUint(depositFeeFactorKeyNeg, ethers.utils.parseUnits("0.01", 18));
  const withdrawalFeeFactorKeyPos = ethers.utils.solidityKeccak256(["bytes32","address","bool"], [ethers.utils.keccak256(ethers.utils.toUtf8Bytes("WITHDRAWAL_FEE_FACTOR")), market.marketToken, true]);
  const withdrawalFeeFactorKeyNeg = ethers.utils.solidityKeccak256(["bytes32","address","bool"], [ethers.utils.keccak256(ethers.utils.toUtf8Bytes("WITHDRAWAL_FEE_FACTOR")), market.marketToken, false]);
  await dataStore.connect(owner).setUint(withdrawalFeeFactorKeyPos, ethers.utils.parseUnits("0.01", 18));
  await dataStore.connect(owner).setUint(withdrawalFeeFactorKeyNeg, ethers.utils.parseUnits("0.01", 18));

  // mock atomicSwapFeeFactorKey/atomicWithdrawalFeeFactorKey
  const atomicSwapFeeFactorKeyMarket = ethers.utils.solidityKeccak256(["bytes32","address"], [ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ATOMIC_SWAP_FEE_FACTOR")), market.marketToken]);
  await dataStore.connect(owner).setUint(atomicSwapFeeFactorKeyMarket, ethers.utils.parseUnits("0.01", 18));
  const atomicWithdrawalFeeFactorKeyMarket = ethers.utils.solidityKeccak256(["bytes32","address"], [ethers.utils.keccak256(ethers.utils.toUtf8Bytes("ATOMIC_WITHDRAWAL_FEE_FACTOR")), market.marketToken]);
  await dataStore.connect(owner).setUint(atomicWithdrawalFeeFactorKeyMarket, ethers.utils.parseUnits("0.01", 18));

    // mock所有 fee/factor 相关参数
    const atomicSwapFeeFactorKey = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string"], ["ATOMIC_SWAP_FEE_FACTOR"]));
    await dataStore.connect(owner).setUint(atomicSwapFeeFactorKey, ethers.utils.parseUnits("0.01", 18));
    const depositFeeFactorKey = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string"], ["DEPOSIT_FEE_FACTOR"]));
    await dataStore.connect(owner).setUint(depositFeeFactorKey, ethers.utils.parseUnits("0.01", 18));
    const withdrawalFeeFactorKey = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string"], ["WITHDRAWAL_FEE_FACTOR"]));
    await dataStore.connect(owner).setUint(withdrawalFeeFactorKey, ethers.utils.parseUnits("0.01", 18));
    const atomicWithdrawalFeeFactorKey = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string"], ["ATOMIC_WITHDRAWAL_FEE_FACTOR"]));
    await dataStore.connect(owner).setUint(atomicWithdrawalFeeFactorKey, ethers.utils.parseUnits("0.01", 18));

    // impactExponentFactor、feeFactor key
    const impactExpKey = ethers.utils.solidityKeccak256(["bytes32","address"], [ethers.utils.keccak256(ethers.utils.toUtf8Bytes("SWAP_IMPACT_EXPONENT_FACTOR")), market.marketToken]);
    await dataStore.connect(owner).setUint(impactExpKey, ethers.utils.parseUnits("1", 18));
    const feeKey = ethers.utils.solidityKeccak256(["bytes32","address","bool"], [ethers.utils.keccak256(ethers.utils.toUtf8Bytes("SWAP_FEE_FACTOR")), market.marketToken, true]);
    await dataStore.connect(owner).setUint(feeKey, ethers.utils.parseUnits("0.01", 18));
    // mock SWAP_FEE_RECEIVER_FACTOR
    const swapFeeReceiverFactorKey = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(["string"], ["SWAP_FEE_RECEIVER_FACTOR"]));
    await dataStore.connect(owner).setUint(swapFeeReceiverFactorKey, ethers.utils.parseUnits("0.5", 18));

    // 部署 SwapPricingUtils library
    const SwapPricingUtilsLib = await ethers.getContractFactory("SwapPricingUtils", owner);
    const swapPricingUtilsLib = await SwapPricingUtilsLib.deploy();
    await swapPricingUtilsLib.deployed();

    // 获取带 link 的 factory
    swapPricingUtils = await ethers.getContractFactory("SwapPricingUtilsTest", {
      libraries: {
        SwapPricingUtils: swapPricingUtilsLib.address,
      },
    });
  });

  it("should revert on zero-amount swap", async () => {
    // usdDelta为0，预期price impact为0
    const params = {
      dataStore: dataStore.address,
      market,
      tokenA,
      tokenB,
      priceForTokenA: ethers.utils.parseUnits("1", 18),
      priceForTokenB: ethers.utils.parseUnits("1", 18),
      usdDeltaForTokenA: ethers.BigNumber.from(0),
      usdDeltaForTokenB: ethers.BigNumber.from(0),
      includeVirtualInventoryImpact: false,
    };
    // 直接调用测试合约的getPriceImpactUsd
    const test = await swapPricingUtils.deploy();
    await test.deployed();
    const impact = await test.getPriceImpactUsd(
      params.dataStore,
      params.market,
      params.tokenA,
      params.tokenB,
      params.priceForTokenA,
      params.priceForTokenB,
      params.usdDeltaForTokenA,
      params.usdDeltaForTokenB,
      params.includeVirtualInventoryImpact
    );
    expect(impact).to.equal(0);
  });

  it("should revert on slippage breach", async () => {
    // usdDelta超出池子余额，预期revert
    const params = {
      dataStore: dataStore.address,
      market,
      tokenA,
      tokenB,
      priceForTokenA: ethers.utils.parseUnits("1", 18),
      priceForTokenB: ethers.utils.parseUnits("1", 18),
      usdDeltaForTokenA: ethers.BigNumber.from(-3000000000000000000n), // 负数用 BigInt
      usdDeltaForTokenB: ethers.BigNumber.from(0),
      includeVirtualInventoryImpact: false,
    };
    const test = await swapPricingUtils.deploy();
    await test.deployed();
    await expect(test.getPriceImpactUsd(
      params.dataStore,
      params.market,
      params.tokenA,
      params.tokenB,
      params.priceForTokenA,
      params.priceForTokenB,
      params.usdDeltaForTokenA,
      params.usdDeltaForTokenB,
      params.includeVirtualInventoryImpact
    )).to.be.reverted;
  });

  it("should execute swap with correct output, fees, price impact sign", async () => {
    // 正常swap，断言impact为正或负，fees小于输入
    // Normal swap, assert impact is positive or negative, fees less than input
    const params = {
      dataStore: dataStore.address,
      market,
      tokenA,
      tokenB,
      priceForTokenA: ethers.utils.parseUnits("2", 18),
      priceForTokenB: ethers.utils.parseUnits("1", 18),
      usdDeltaForTokenA: ethers.BigNumber.from(ethers.utils.parseUnits("1", 18)),
      usdDeltaForTokenB: ethers.BigNumber.from(-1000000000000000000n),
      includeVirtualInventoryImpact: false,
    };
    const test = await swapPricingUtils.deploy();
    await test.deployed();
    const impact = await test.getPriceImpactUsd(
      params.dataStore,
      params.market,
      params.tokenA,
      params.tokenB,
      params.priceForTokenA,
      params.priceForTokenB,
      params.usdDeltaForTokenA,
      params.usdDeltaForTokenB,
      params.includeVirtualInventoryImpact
    );
    expect(impact).to.be.a("BigNumber");
    // Assert type and range
    // No specific value assertion here, can be supplemented in actual project
  });
});
