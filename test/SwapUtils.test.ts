import { expect } from "chai";
import { ethers } from "hardhat";
import { Signer } from "ethers";

describe("SwapUtils", function () {
  let deployer: Signer;
  let deployerAddr: string;

  // Contracts
  let DataStore: any;
  let dataStore: any;
  let MockOracle: any;
  let mockOracle: any;
  let MockBank: any;
  let mockBank: any;
  let MockEventEmitter: any;
  let mockEventEmitter: any;
  let RoleStore: any;
  let roleStore: any;
  let SwapHandler: any;
  let swapHandler: any;

  // tokens / market addresses used in tests
  const tokenA = "0x00000000000000000000000000000000000000aA";
  const tokenB = "0x00000000000000000000000000000000000000bB";
  const marketToken = "0x00000000000000000000000000000000000000mM";

  beforeEach(async function () {
    [deployer] = await ethers.getSigners();
    deployerAddr = await deployer.getAddress();

    // Deploy DataStore (repo-provided)
    DataStore = await ethers.getContractFactory("DataStore");
    dataStore = await DataStore.deploy();
    await dataStore.deployed();

    // Deploy mocks: MockOracle, MockBank, MockEventEmitter
    // Ensure these mock sources exist in contracts/ (see assistant-provided examples earlier)
    MockOracle = await ethers.getContractFactory("MockOracle");
    mockOracle = await MockOracle.deploy();
    await mockOracle.deployed();

    MockBank = await ethers.getContractFactory("MockBank");
    mockBank = await MockBank.deploy();
    await mockBank.deployed();

    MockEventEmitter = await ethers.getContractFactory("MockEventEmitter");
    mockEventEmitter = await MockEventEmitter.deploy();
    await mockEventEmitter.deployed();

    // Deploy role store + SwapHandler (SwapHandler calls SwapUtils.swap internally)
    RoleStore = await ethers.getContractFactory("RoleStore");
    roleStore = await RoleStore.deploy();
    await roleStore.deployed();

    SwapHandler = await ethers.getContractFactory("SwapHandler");
    swapHandler = await SwapHandler.deploy(roleStore.address);
    await swapHandler.deployed();

    try {
      await roleStore.grantController(deployerAddr);
    } catch (e) {
      console.warn("grantController failed, proceeding if role not required:", e);
    }

    // Initialize DataStore keys that SwapUtils expects:
    // - pool amounts for marketToken / tokenA and marketToken / tokenB
    // - fee factors (swap fee)
    const poolAKey = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(["string", "address", "address"], ["POOLAMOUNT", marketToken, tokenA])
    );
    const poolBKey = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(["string", "address", "address"], ["POOLAMOUNT", marketToken, tokenB])
    );

    // set pool amounts to 1000e18
    await dataStore.setUint(poolAKey, ethers.utils.parseEther("1000"));
    await dataStore.setUint(poolBKey, ethers.utils.parseEther("1000"));

    // swap fee factors keys - adjust encoding to match your Keys.swapFeeFactorKey
    const swapFeeBuyKey = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(["string", "address", "bool"], ["SWAP_FEE_FACTOR", marketToken, true])
    );
    const swapFeeSellKey = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(["string", "address", "bool"], ["SWAP_FEE_FACTOR", marketToken, false])
    );

    // set 1% buy, 2% sell (assuming 1e18 scale)
    const onePercent = ethers.utils.parseUnits("0.01", 18);
    const twoPercent = ethers.utils.parseUnits("0.02", 18);
    await dataStore.setUint(swapFeeBuyKey, onePercent);
    await dataStore.setUint(swapFeeSellKey, twoPercent);

    // set swap fee receiver factor key
    const uiFeeFactorKey = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(["string"], ["SWAP_FEE_RECEIVER_FACTOR"])
    );
    await dataStore.setUint(uiFeeFactorKey, ethers.utils.parseUnits("0.5", 18));

  });

  it("handles zero amount input (returns input token unchanged)", async function () {
    const params = {
      dataStore: dataStore.address,
      eventEmitter: mockEventEmitter.address,
      oracle: mockOracle.address,
      bank: mockBank.address,
      key: ethers.utils.id("test_zero"),
      tokenIn: tokenA,
      amountIn: 0,
      swapPathMarkets: [],
      minOutputAmount: 0,
      receiver: deployerAddr,
      uiFeeReceiver: ethers.constants.AddressZero,
      shouldUnwrapNativeToken: false,
      swapPricingType: 0 // Swap (enum value)
    };

    // Use callStatic to read return values without sending tx
    const result = await swapHandler.callStatic.swap(params);
    const outputToken = result[0];
    const outputAmount = result[1];

    expect(outputToken).to.equal(tokenA);
    expect(outputAmount).to.equal(0);
  });

  it("reverts for invalid token in", async function () {
    // one-market path where valid tokens are tokenA/tokenB
    const markets = [
      {
        marketToken: marketToken,
        indexToken: ethers.constants.AddressZero,
        longToken: tokenA,
        shortToken: tokenB
      }
    ];

    const params = {
      dataStore: dataStore.address,
      eventEmitter: mockEventEmitter.address,
      oracle: mockOracle.address,
      bank: mockBank.address,
      key: ethers.utils.id("test_invalid_token"),
      tokenIn: "0x0000000000000000000000000000000000000ff", // invalid token
      amountIn: ethers.utils.parseEther("100"),
      swapPathMarkets: markets,
      minOutputAmount: 0,
      receiver: deployerAddr,
      uiFeeReceiver: ethers.constants.AddressZero,
      shouldUnwrapNativeToken: false,
      swapPricingType: 0
    };

    await expect(swapHandler.swap(params)).to.be.reverted;
  });

  it("reverts for insufficient output (minOutputAmount too high)", async function () {
    const markets = [
      {
        marketToken: marketToken,
        indexToken: ethers.constants.AddressZero,
        longToken: tokenA,
        shortToken: tokenB
      }
    ];

    const params = {
      dataStore: dataStore.address,
      eventEmitter: mockEventEmitter.address,
      oracle: mockOracle.address,
      bank: mockBank.address,
      key: ethers.utils.id("test_insufficient"),
      tokenIn: tokenA,
      amountIn: ethers.utils.parseEther("100"),
      swapPathMarkets: markets,
      minOutputAmount: ethers.utils.parseEther("200"),
      receiver: deployerAddr,
      uiFeeReceiver: ethers.constants.AddressZero,
      shouldUnwrapNativeToken: false,
      swapPricingType: 0
    };

    await expect(swapHandler.swap(params)).to.be.reverted;
  });

  it("handles multi-market swap path", async function () {
    // A -> B then B -> A
    const mkt1 = ethers.Wallet.createRandom().address;
    const mkt2 = ethers.Wallet.createRandom().address;

    const markets = [
      {
        marketToken: mkt1,
        indexToken: ethers.constants.AddressZero,
        longToken: tokenA,
        shortToken: tokenB
      },
      {
        marketToken: mkt2,
        indexToken: ethers.constants.AddressZero,
        longToken: tokenB,
        shortToken: tokenA
      }
    ];

    const flagKey1 = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(["string", "address"], ["SWAP_PATH_MARKET_FLAG", mkt1])
    );
    const flagKey2 = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(["string", "address"], ["SWAP_PATH_MARKET_FLAG", mkt2])
    );
    await dataStore.setBool(flagKey1, false);
    await dataStore.setBool(flagKey2, false);

    const params = {
      dataStore: dataStore.address,
      eventEmitter: mockEventEmitter.address,
      oracle: mockOracle.address,
      bank: mockBank.address,
      key: ethers.utils.id("test_multi"),
      tokenIn: tokenA,
      amountIn: ethers.utils.parseEther("100"),
      swapPathMarkets: markets,
      minOutputAmount: ethers.utils.parseEther("80"),
      receiver: deployerAddr,
      uiFeeReceiver: ethers.constants.AddressZero,
      shouldUnwrapNativeToken: false,
      swapPricingType: 0
    };

    const result = await swapHandler.callStatic.swap(params);
    const outputToken = result[0];
    const outputAmount = result[1];

    // After A->B->A, we expect the final token to be A again
    expect(outputToken).to.equal(tokenA);
    expect(outputAmount).to.gte(ethers.utils.parseEther("80"));
  });
});
