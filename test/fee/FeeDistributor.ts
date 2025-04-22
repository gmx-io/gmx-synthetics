import { expect } from "chai";
import { grantRole } from "../../utils/role";
import { expandDecimals } from "../../utils/math";
import { deployFixture } from "../../utils/fixture";
import { encodeData } from "../../utils/hash";
import { deployContract } from "../../utils/deploy";
import { errorsContract } from "../../utils/error";
import { parseLogs } from "../../utils/event";
import * as keys from "../../utils/keys";
import * as feeDistributorConfig from "../../utils/feeDistributor";

describe("FeeDistributor", function () {
  let fixture,
    feeDistributor,
    feeDistributorVault,
    multichainReader,
    mockEndpointV2,
    dataStore,
    config,
    wnt,
    gmx,
    esGmx,
    roleStore,
    feeHandler,
    mockExtendedGmxDistributor,
    mockFeeGlpDistributor,
    mockLzReadResponseChain1,
    mockExtendedGmxTracker,
    mockLzReadResponseChain3,
    mockFeeGlpTracker,
    mockSynapseRouter,
    mockVester,
    initialTimestamp,
    chainlinkPriceFeedProvider,
    wethPriceFeed,
    gmxPriceFeed,
    wallet,
    user0,
    user1,
    user2,
    user3,
    user4,
    user5,
    user6,
    user7,
    user8,
    distributionState,
    wntReferralRewardsInUsd,
    esGmxForReferralRewards,
    feesV1Usd,
    feesV2Usd;

  // Constants representing mock Endpoint IDs for testing purposes
  const eid1 = 1000;
  const eid2 = 2000;
  const eid3 = 3000;

  // Constants representing chain ID for testing purposes
  const chainId1 = 10000;
  const chainId2 = 31337;
  const chainId3 = 20000;
  const chainIds = [chainId1, chainId2, chainId3];

  const distributionDay = 3;

  // Constant representing a channel ID for testing purposes
  const channelId = 1001;

  // Number of confirmations used for test
  const numberOfConfirmations = 1;

  beforeEach(async function () {
    fixture = await deployFixture();
    ({
      feeDistributor,
      feeDistributorVault,
      multichainReader,
      mockEndpointV2,
      dataStore,
      config,
      wnt,
      gmx,
      esGmx,
      roleStore,
      feeHandler,
      chainlinkPriceFeedProvider,
      wethPriceFeed,
      gmxPriceFeed,
    } = fixture.contracts);

    ({ wallet, user0, user1, user2, user3, user4, user5, user6, user7, user8 } = fixture.accounts);

    mockExtendedGmxDistributor = await deployContract("MockRewardDistributorV1", []);
    mockFeeGlpDistributor = await deployContract("MockRewardDistributorV1", []);
    mockLzReadResponseChain1 = await deployContract("MockLzReadResponse", []);
    mockExtendedGmxTracker = await deployContract("MockRewardTrackerV1", [mockExtendedGmxDistributor.address]);
    mockLzReadResponseChain3 = await deployContract("MockLzReadResponse", []);
    mockFeeGlpTracker = await deployContract("MockRewardTrackerV1", [mockFeeGlpDistributor.address]);
    mockSynapseRouter = await deployContract("MockSynapseRouter", []);
    mockVester = await deployContract("MockVesterV1", [
      [user7.address, user8.address, wallet.address],
      [expandDecimals(10, 18), expandDecimals(30, 18), expandDecimals(20, 18)],
    ]);

    await grantRole(roleStore, wallet.address, "FEE_DISTRIBUTION_KEEPER");

    // set mock contract values
    await mockEndpointV2.setDestLzEndpoint(multichainReader.address, mockEndpointV2.address);
    await mockEndpointV2.setReadChannelId(channelId);
    await mockSynapseRouter.setBridgeSlippageFactor(encodeData(["uint256"], [expandDecimals(99, 28)]));

    const originator = feeDistributor.address;

    // Setting LZRead configuration in dataStore for multichainReader and mockMultichainReaderOriginator
    await config.setBool(keys.MULTICHAIN_AUTHORIZED_ORIGINATORS, encodeData(["address"], [originator]), "true");
    await config.setUint(keys.MULTICHAIN_READ_CHANNEL, "0x", channelId);
    await config.setBytes32(
      keys.MULTICHAIN_PEERS,
      encodeData(["uint256"], [channelId]),
      ethers.utils.hexZeroPad(multichainReader.address, 32)
    );
    for (const eid of [eid1, eid2, eid3]) {
      await config.setUint(
        keys.MULTICHAIN_AUTHORIZED_ORIGINATORS,
        encodeData(["uint256"], [eid]),
        numberOfConfirmations
      );
    }

    // Setting feeDistributor configuration in config and dataStore
    await config.setUint(keys.FEE_DISTRIBUTOR_DISTRIBUTION_DAY, "0x", distributionDay);
    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);
    const block = await ethers.provider.getBlock("latest");
    initialTimestamp = block.timestamp;
    await dataStore.setUint(keys.FEE_DISTRIBUTOR_DISTRIBUTION_TIMESTAMP, initialTimestamp);

    await config.setUint(keys.FEE_DISTRIBUTOR_REFERRAL_REWARDS_WNT_USD_LIMIT, "0x", expandDecimals(1_000_000, 30));
    await config.setUint(keys.FEE_DISTRIBUTOR_MAX_READ_RESPONSE_DELAY, "0x", 600);
    await config.setUint(keys.FEE_DISTRIBUTOR_GAS_LIMIT, "0x", 5_000_000);
    await dataStore.setUintArray(keys.FEE_DISTRIBUTOR_CHAIN_ID, chainIds);
    await config.setUint(keys.FEE_DISTRIBUTOR_LAYERZERO_CHAIN_ID, encodeData(["uint256"], [chainId1]), eid1);
    await config.setUint(keys.FEE_DISTRIBUTOR_LAYERZERO_CHAIN_ID, encodeData(["uint256"], [chainId2]), eid2);
    await config.setUint(keys.FEE_DISTRIBUTOR_LAYERZERO_CHAIN_ID, encodeData(["uint256"], [chainId3]), eid3);
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainId1, feeDistributorConfig.gmxKey]),
      gmx.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainId2, feeDistributorConfig.gmxKey]),
      gmx.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainId3, feeDistributorConfig.gmxKey]),
      gmx.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainId1, feeDistributorConfig.extendedGmxTrackerKey]),
      mockLzReadResponseChain1.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainId2, feeDistributorConfig.extendedGmxTrackerKey]),
      mockExtendedGmxTracker.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainId3, feeDistributorConfig.extendedGmxTrackerKey]),
      mockLzReadResponseChain3.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainId1, feeDistributorConfig.dataStoreKey]),
      mockLzReadResponseChain1.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainId3, feeDistributorConfig.dataStoreKey]),
      mockLzReadResponseChain3.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainId2, feeDistributorConfig.feeGlpTrackerKey]),
      mockFeeGlpTracker.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainId1, keys.FEE_RECEIVER]),
      user0.address
    );
    await dataStore.setAddress(keys.FEE_RECEIVER, feeDistributorVault.address);
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainId3, keys.FEE_RECEIVER]),
      user1.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainId2, feeDistributorConfig.synapseRouterKey]),
      mockSynapseRouter.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainId2, feeDistributorConfig.chainlinkKey]),
      user5.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainId2, feeDistributorConfig.treasuryKey]),
      user6.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainId2, feeDistributorConfig.esGmxVesterKey]),
      mockVester.address
    );
    await config.setUint(
      keys.FEE_DISTRIBUTOR_BRIDGE_SLIPPAGE_FACTOR,
      encodeData(["uint256"], [chainId1]),
      expandDecimals(99, 28)
    );
    await config.setUint(
      keys.FEE_DISTRIBUTOR_BRIDGE_SLIPPAGE_FACTOR,
      encodeData(["uint256"], [chainId2]),
      expandDecimals(99, 28)
    );
    await config.setUint(
      keys.FEE_DISTRIBUTOR_BRIDGE_SLIPPAGE_FACTOR,
      encodeData(["uint256"], [chainId3]),
      expandDecimals(99, 28)
    );
    await config.setUint(keys.FEE_DISTRIBUTOR_BRIDGE_SLIPPAGE_AMOUNT, "0x", expandDecimals(1, 14));
    await config.setUint(
      keys.FEE_DISTRIBUTOR_AMOUNT_THRESHOLD,
      encodeData(["bytes32"], [feeDistributorConfig.referralRewardsEsGmxKey]),
      expandDecimals(99, 28)
    );
    await config.setUint(
      keys.FEE_DISTRIBUTOR_AMOUNT_THRESHOLD,
      encodeData(["bytes32"], [feeDistributorConfig.referralRewardsWntKey]),
      expandDecimals(20, 28)
    );
    await config.setUint(
      keys.FEE_DISTRIBUTOR_AMOUNT_THRESHOLD,
      encodeData(["bytes32"], [feeDistributorConfig.glpKey]),
      expandDecimals(80, 28)
    );
    await config.setUint(
      keys.FEE_DISTRIBUTOR_AMOUNT_THRESHOLD,
      encodeData(["bytes32"], [feeDistributorConfig.treasuryKey]),
      expandDecimals(70, 28)
    );
    await dataStore.setAddressArray(keys.FEE_DISTRIBUTOR_KEEPER_COSTS, [user2.address, user3.address, user4.address]);
    await dataStore.setUintArray(keys.FEE_DISTRIBUTOR_KEEPER_COSTS, [
      expandDecimals(3, 15),
      expandDecimals(5, 15),
      expandDecimals(4, 15),
    ]);
    await dataStore.setBoolArray(keys.FEE_DISTRIBUTOR_KEEPER_COSTS, [true, false, true]);
    await config.setUint(keys.FEE_DISTRIBUTOR_KEEPER_GLP_FACTOR, "0x", expandDecimals(50, 28));
    await config.setUint(keys.FEE_DISTRIBUTOR_CHAINLINK_FACTOR, "0x", expandDecimals(12, 28));
    await config.setUint(keys.FEE_DISTRIBUTOR_BRIDGE_ORIGIN_DEADLINE, encodeData(["uint256"], [chainId2]), 300);
    await config.setUint(keys.FEE_DISTRIBUTOR_BRIDGE_DEST_DEADLINE, encodeData(["uint256"], [chainId1]), 600);
    await config.setUint(keys.FEE_DISTRIBUTOR_BRIDGE_DEST_DEADLINE, encodeData(["uint256"], [chainId3]), 600);
    await config.setUint(keys.BUYBACK_BATCH_AMOUNT, encodeData(["address"], [gmx.address]), expandDecimals(5, 17));
    await config.setUint(keys.BUYBACK_BATCH_AMOUNT, encodeData(["address"], [wnt.address]), expandDecimals(5, 17));
    await dataStore.setAddress(keys.oracleProviderForTokenKey(wnt.address), chainlinkPriceFeedProvider.address);
    await dataStore.setAddress(keys.oracleProviderForTokenKey(gmx.address), chainlinkPriceFeedProvider.address);

    await user2.sendTransaction({
      to: wallet.address,
      value: expandDecimals(10_000, 18).sub(expandDecimals(1, 15)),
    });
    await user3.sendTransaction({
      to: wallet.address,
      value: expandDecimals(10_000, 18).sub(expandDecimals(2, 15)),
    });
    await user4.sendTransaction({
      to: wallet.address,
      value: expandDecimals(10_000, 18).sub(expandDecimals(5, 15)),
    });

    await wnt.mint(feeDistributorVault.address, expandDecimals(1_000, 18));

    wntReferralRewardsInUsd = expandDecimals(1_000, 30);
    esGmxForReferralRewards = expandDecimals(100, 18);
    feesV1Usd = expandDecimals(40_000, 30);
    feesV2Usd = expandDecimals(100_000, 30);
  });

  it("initiateDistribute() can only be executed by FEE_DISTRIBUTION_KEEPER", async function () {
    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);
    expect(distributionState).to.eq(0);

    await expect(feeDistributor.connect(user0).initiateDistribute()).to.be.revertedWithCustomError(
      errorsContract,
      "Unauthorized",
      "FEE_DISTRIBUTION_KEEPER"
    );
  });

  it("initiateDistribute() cannot be executed if current week distribution is already completed", async function () {
    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);
    expect(distributionState).to.eq(0);

    await expect(feeDistributor.initiateDistribute()).to.be.revertedWithCustomError(
      errorsContract,
      "FeeDistributionAlreadyCompleted",
      initialTimestamp,
      initialTimestamp - 60
    );
  });

  it("initiateDistribute() and processLzReceive() for fee deficit", async function () {
    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);
    expect(distributionState).to.eq(0);

    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    await mockLzReadResponseChain1.setTotalSupply(expandDecimals(6_000_000, 18));
    await mockExtendedGmxTracker.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockLzReadResponseChain3.setTotalSupply(expandDecimals(3_000_000, 18));

    await mockLzReadResponseChain1.setUint(
      keys.withdrawableBuybackTokenAmountKey(gmx.address),
      expandDecimals(40_000, 18)
    );
    await mockLzReadResponseChain3.setUint(
      keys.withdrawableBuybackTokenAmountKey(gmx.address),
      expandDecimals(20_000, 18)
    );
    await dataStore.setUint(keys.withdrawableBuybackTokenAmountKey(gmx.address), expandDecimals(10_000, 18));
    await gmx.mint(feeHandler.address, expandDecimals(10_000, 18));

    await gmx.mint(user0.address, expandDecimals(120_000, 18));
    await gmx.mint(feeDistributorVault.address, expandDecimals(40_000, 18));
    await gmx.mint(user1.address, expandDecimals(10_000, 18));

    await wallet.sendTransaction({
      to: feeDistributor.address,
      value: expandDecimals(1, 18),
    });

    let wntPrice = await wethPriceFeed.latestAnswer();
    expect(wntPrice).to.eq(expandDecimals(5_000, 8));

    let gmxPrice = await gmxPriceFeed.latestAnswer();
    expect(gmxPrice).to.eq(expandDecimals(20, 8));

    const tx = await feeDistributor.initiateDistribute();
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt.blockNumber);
    const timestamp = block.timestamp;

    const distributeTimestamp = await dataStore.getUint(keys.FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP);

    const feeDistributionInitiatedEventData = parseLogs(fixture, receipt)[6].parsedEventData;
    const feeDistributionDataReceived = parseLogs(fixture, receipt)[3].parsedEventData;

    const feeAmountGmx1 = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainId1));
    const feeAmountGmx2 = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainId2));
    const feeAmountGmx3 = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainId3));
    const totalFeeAmountGmx = await dataStore.getUint(keys.FEE_DISTRIBUTOR_TOTAL_FEE_AMOUNT_GMX);

    const stakedGmx1 = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainId1));
    const stakedGmx2 = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainId2));
    const stakedGmx3 = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainId3));
    const totalStakedGmx = await dataStore.getUint(keys.FEE_DISTRIBUTOR_TOTAL_STAKED_GMX);

    wntPrice = await dataStore.getUint(keys.FEE_DISTRIBUTOR_WNT_PRICE);
    gmxPrice = await dataStore.getUint(keys.FEE_DISTRIBUTOR_GMX_PRICE);

    expect(distributeTimestamp).to.equal(timestamp);

    expect(feeDistributionInitiatedEventData.numberOfChainsReadRequests).to.equal(2);
    expect(feeDistributionDataReceived.isBridgingCompleted).is.false;

    expect(feeAmountGmx1).to.equal(expandDecimals(160_000, 18));
    expect(feeAmountGmx2).to.equal(expandDecimals(50_000, 18));
    expect(feeAmountGmx3).to.equal(expandDecimals(30_000, 18));
    expect(totalFeeAmountGmx).to.equal(expandDecimals(240_000, 18));

    expect(stakedGmx1).to.equal(expandDecimals(6_000_000, 18));
    expect(stakedGmx2).to.equal(expandDecimals(3_000_000, 18));
    expect(stakedGmx3).to.equal(expandDecimals(3_000_000, 18));
    expect(totalStakedGmx).to.equal(expandDecimals(12_000_000, 18));

    expect(wntPrice).to.equal(expandDecimals(5_000, 12));
    expect(gmxPrice).to.equal(expandDecimals(20, 12));
  });

  it("initiateDistribute() and processLzReceive() for fee surplus", async function () {
    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);
    expect(distributionState).to.eq(0);

    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    await mockLzReadResponseChain1.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockExtendedGmxTracker.setTotalSupply(expandDecimals(6_000_000, 18));
    await mockLzReadResponseChain3.setTotalSupply(expandDecimals(3_000_000, 18));

    await mockLzReadResponseChain1.setUint(
      keys.withdrawableBuybackTokenAmountKey(gmx.address),
      expandDecimals(10_000, 18)
    );
    await mockLzReadResponseChain3.setUint(
      keys.withdrawableBuybackTokenAmountKey(gmx.address),
      expandDecimals(20_000, 18)
    );
    await dataStore.setUint(keys.withdrawableBuybackTokenAmountKey(gmx.address), expandDecimals(40_000, 18));
    await gmx.mint(feeHandler.address, expandDecimals(40_000, 18));

    await gmx.mint(user0.address, expandDecimals(40_000, 18));
    await gmx.mint(feeDistributorVault.address, expandDecimals(120_000, 18));
    await gmx.mint(user1.address, expandDecimals(10_000, 18));

    await wallet.sendTransaction({
      to: feeDistributor.address,
      value: expandDecimals(1, 18),
    });

    let wntPrice = await wethPriceFeed.latestAnswer();
    expect(wntPrice).to.eq(expandDecimals(5_000, 8));

    let gmxPrice = await gmxPriceFeed.latestAnswer();
    expect(gmxPrice).to.eq(expandDecimals(20, 8));

    const tx = await feeDistributor.initiateDistribute();
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt.blockNumber);
    const timestamp = block.timestamp;

    const distributeTimestamp = await dataStore.getUint(keys.FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP);

    const feeDistributionInitiatedEventData = parseLogs(fixture, receipt)[15].parsedEventData;
    const feeDistributionDataReceived = parseLogs(fixture, receipt)[12].parsedEventData;
    const feeDistributionGmxBridgedOut = parseLogs(fixture, receipt)[11].parsedEventData;

    const feeAmountGmx1 = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainId1));
    const feeAmountGmx2 = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainId2));
    const feeAmountGmx3 = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainId3));
    const totalFeeAmountGmx = await dataStore.getUint(keys.FEE_DISTRIBUTOR_TOTAL_FEE_AMOUNT_GMX);

    const stakedGmx1 = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainId1));
    const stakedGmx2 = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainId2));
    const stakedGmx3 = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainId3));
    const totalStakedGmx = await dataStore.getUint(keys.FEE_DISTRIBUTOR_TOTAL_STAKED_GMX);

    wntPrice = await dataStore.getUint(keys.FEE_DISTRIBUTOR_WNT_PRICE);
    gmxPrice = await dataStore.getUint(keys.FEE_DISTRIBUTOR_GMX_PRICE);

    const feeAmountAfterBridging1 = await gmx.balanceOf(user0.address);
    const feeAmountAfterBridging2 = await gmx.balanceOf(feeDistributorVault.address);
    const feeAmountAfterBridging3 = await gmx.balanceOf(user1.address);

    expect(distributeTimestamp).to.equal(timestamp);

    expect(feeDistributionInitiatedEventData.numberOfChainsReadRequests).to.equal(2);
    expect(feeDistributionDataReceived.isBridgingCompleted).is.true;
    expect(feeDistributionGmxBridgedOut.totalGmxBridgedOut).to.equal(expandDecimals(40_000, 18));

    expect(feeAmountGmx1).to.equal(expandDecimals(50_000, 18));
    expect(feeAmountGmx2).to.equal(expandDecimals(120_000, 18));
    expect(feeAmountGmx3).to.equal(expandDecimals(30_000, 18));
    expect(totalFeeAmountGmx).to.equal(expandDecimals(240_000, 18));

    expect(stakedGmx1).to.equal(expandDecimals(3_000_000, 18));
    expect(stakedGmx2).to.equal(expandDecimals(6_000_000, 18));
    expect(stakedGmx3).to.equal(expandDecimals(3_000_000, 18));
    expect(totalStakedGmx).to.equal(expandDecimals(12_000_000, 18));

    expect(wntPrice).to.equal(expandDecimals(5_000, 12));
    expect(gmxPrice).to.equal(expandDecimals(20, 12));

    expect(feeAmountAfterBridging1).to.equal(expandDecimals(49_900, 18));
    expect(feeAmountAfterBridging2).to.equal(expandDecimals(120_000, 18));
    expect(feeAmountAfterBridging3).to.equal(expandDecimals(39_700, 18));
  });

  it("distribute() and sendReferralRewards() for fee deficit", async function () {
    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);
    expect(distributionState).to.eq(0);

    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    await mockLzReadResponseChain1.setTotalSupply(expandDecimals(6_000_000, 18));
    await mockExtendedGmxTracker.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockLzReadResponseChain3.setTotalSupply(expandDecimals(3_000_000, 18));

    await mockLzReadResponseChain1.setUint(
      keys.withdrawableBuybackTokenAmountKey(gmx.address),
      expandDecimals(40_000, 18)
    );
    await mockLzReadResponseChain3.setUint(
      keys.withdrawableBuybackTokenAmountKey(gmx.address),
      expandDecimals(20_000, 18)
    );
    await dataStore.setUint(keys.withdrawableBuybackTokenAmountKey(gmx.address), expandDecimals(10_000, 18));
    await gmx.mint(feeHandler.address, expandDecimals(10_000, 18));

    await gmx.mint(user0.address, expandDecimals(120_000, 18));
    await gmx.mint(feeDistributorVault.address, expandDecimals(40_000, 18));
    await gmx.mint(user1.address, expandDecimals(10_000, 18));

    await wallet.sendTransaction({
      to: feeDistributor.address,
      value: expandDecimals(1, 18),
    });

    let wntPrice = await wethPriceFeed.latestAnswer();
    expect(wntPrice).to.eq(expandDecimals(5_000, 8));

    let gmxPrice = await gmxPriceFeed.latestAnswer();
    expect(gmxPrice).to.eq(expandDecimals(20, 8));

    const tx = await feeDistributor.initiateDistribute();
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt.blockNumber);
    const timestamp = block.timestamp;

    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);

    const distributeTimestamp = await dataStore.getUint(keys.FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP);

    const feeDistributionInitiatedEventData = parseLogs(fixture, receipt)[6].parsedEventData;
    const feeDistributionDataReceived = parseLogs(fixture, receipt)[3].parsedEventData;

    const feeAmountGmx1 = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainId1));
    const feeAmountGmx2 = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainId2));
    const feeAmountGmx3 = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainId3));
    const totalFeeAmountGmx = await dataStore.getUint(keys.FEE_DISTRIBUTOR_TOTAL_FEE_AMOUNT_GMX);

    const stakedGmx1 = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainId1));
    const stakedGmx2 = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainId2));
    const stakedGmx3 = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainId3));
    const totalStakedGmx = await dataStore.getUint(keys.FEE_DISTRIBUTOR_TOTAL_STAKED_GMX);

    wntPrice = await dataStore.getUint(keys.FEE_DISTRIBUTOR_WNT_PRICE);
    gmxPrice = await dataStore.getUint(keys.FEE_DISTRIBUTOR_GMX_PRICE);

    expect(distributionState).to.eq(2);

    expect(distributeTimestamp).to.equal(timestamp);

    expect(feeDistributionInitiatedEventData.numberOfChainsReadRequests).to.equal(2);
    expect(feeDistributionDataReceived.isBridgingCompleted).is.false;

    expect(feeAmountGmx1).to.equal(expandDecimals(160_000, 18));
    expect(feeAmountGmx2).to.equal(expandDecimals(50_000, 18));
    expect(feeAmountGmx3).to.equal(expandDecimals(30_000, 18));
    expect(totalFeeAmountGmx).to.equal(expandDecimals(240_000, 18));

    expect(stakedGmx1).to.equal(expandDecimals(6_000_000, 18));
    expect(stakedGmx2).to.equal(expandDecimals(3_000_000, 18));
    expect(stakedGmx3).to.equal(expandDecimals(3_000_000, 18));
    expect(totalStakedGmx).to.equal(expandDecimals(12_000_000, 18));

    expect(wntPrice).to.equal(expandDecimals(5_000, 12));
    expect(gmxPrice).to.equal(expandDecimals(20, 12));

    await gmx.connect(user0).transfer(feeDistributorVault.address, expandDecimals(10_000, 18));
    await gmx.connect(user0).transfer(user1.address, expandDecimals(30_000, 18));

    const user0Balance = await gmx.balanceOf(user0.address);
    const feeDistributorVaultBalance = await gmx.balanceOf(feeDistributorVault.address);
    const user1Balance = await gmx.balanceOf(user1.address);

    expect(user0Balance).to.equal(expandDecimals(80_000, 18));
    expect(feeDistributorVaultBalance).to.equal(expandDecimals(60_000, 18));
    expect(user1Balance).to.equal(expandDecimals(40_000, 18));

    await feeDistributor.bridgedGmxReceived();

    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);
    expect(distributionState).to.eq(3);

    const keeper1BalancePreDistribute = await ethers.provider.getBalance(user2.address);
    const keeper2BalancePreDistribute = await ethers.provider.getBalance(user3.address);
    const totalWntBalance = await wnt.balanceOf(feeDistributorVault.address);

    const distributeTx = await feeDistributor.distribute(
      wntReferralRewardsInUsd,
      esGmxForReferralRewards,
      feesV1Usd,
      feesV2Usd
    );
    const distributeReceipt = await distributeTx.wait();
    const distributeEventData = parseLogs(fixture, distributeReceipt)[7].parsedEventData;

    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);

    const keeperCosts = await dataStore.getUintArray(keys.FEE_DISTRIBUTOR_KEEPER_COSTS);

    const keeper1Balance = await ethers.provider.getBalance(user2.address);
    const keeper2Balance = await ethers.provider.getBalance(user3.address);
    const keeper3Balance = await ethers.provider.getBalance(user4.address);

    const sentToKeeper1 = keeperCosts[0].sub(keeper1BalancePreDistribute);
    const sentToKeeper2 = keeperCosts[1].sub(keeper2BalancePreDistribute);
    const glpFactor = await dataStore.getUint(keys.FEE_DISTRIBUTOR_KEEPER_GLP_FACTOR);
    const sentToKeeper2GlpCost = sentToKeeper2.mul(glpFactor).div(expandDecimals(1, 30));
    const sentToKeeper2TreasuryCost = sentToKeeper2.sub(sentToKeeper2GlpCost);
    const keeperCostsGlp = sentToKeeper2GlpCost;
    const keeperCostsTreasury = sentToKeeper1.add(sentToKeeper2TreasuryCost);
    const wntForKeepers = sentToKeeper1.add(sentToKeeper2);
    const totalFees = feesV1Usd.add(feesV2Usd);
    const chainlinkTreasuryWntAmount = totalWntBalance.mul(feesV2Usd).div(totalFees);
    const chainlinkFactor = await dataStore.getUint(keys.FEE_DISTRIBUTOR_CHAINLINK_FACTOR);
    const wntForChainlink = chainlinkTreasuryWntAmount.mul(chainlinkFactor).div(expandDecimals(1, 30));
    const wntForTreasury = chainlinkTreasuryWntAmount.sub(wntForChainlink).sub(keeperCostsTreasury);
    const wntForReferralRewards = wntReferralRewardsInUsd.div(wntPrice);
    const wntForGlp = totalWntBalance
      .sub(keeperCostsGlp)
      .sub(keeperCostsTreasury)
      .sub(wntForChainlink)
      .sub(wntForTreasury)
      .sub(wntForReferralRewards);

    expect(distributionState).to.eq(0);

    expect(keeper1Balance).to.eq(keeperCosts[0]);
    expect(keeper2Balance).to.eq(keeperCosts[1]);
    expect(keeper3Balance).gte(keeperCosts[2]);

    expect(distributeEventData.feesV1Usd).to.eq(feesV1Usd);
    expect(distributeEventData.feesV2Usd).to.eq(feesV2Usd);
    expect(distributeEventData.wntForKeepers).to.eq(wntForKeepers);
    expect(distributeEventData.wntForChainlink).to.eq(wntForChainlink);
    expect(distributeEventData.wntForTreasury).to.eq(wntForTreasury);
    expect(distributeEventData.wntForGlp).to.eq(wntForGlp);
    expect(distributeEventData.wntForReferralRewards).to.eq(wntForReferralRewards);
    expect(distributeEventData.esGmxForReferralRewards).to.eq(esGmxForReferralRewards);

    await feeDistributor.sendReferralRewards(
      wnt.address,
      5,
      [user7.address, user8.address, wallet.address],
      [expandDecimals(8, 16), expandDecimals(5, 16), expandDecimals(7, 16)]
    );

    await feeDistributor.sendReferralRewards(
      esGmx.address,
      5,
      [user7.address, user8.address, wallet.address],
      [expandDecimals(50, 18), expandDecimals(20, 18), expandDecimals(30, 18)]
    );
  });

  it("distribute() and sendReferralRewards() for fee surplus", async function () {
    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);
    expect(distributionState).to.eq(0);

    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    await mockLzReadResponseChain1.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockExtendedGmxTracker.setTotalSupply(expandDecimals(6_000_000, 18));
    await mockLzReadResponseChain3.setTotalSupply(expandDecimals(3_000_000, 18));

    await mockLzReadResponseChain1.setUint(
      keys.withdrawableBuybackTokenAmountKey(gmx.address),
      expandDecimals(10_000, 18)
    );
    await mockLzReadResponseChain3.setUint(
      keys.withdrawableBuybackTokenAmountKey(gmx.address),
      expandDecimals(20_000, 18)
    );
    await dataStore.setUint(keys.withdrawableBuybackTokenAmountKey(gmx.address), expandDecimals(40_000, 18));
    await gmx.mint(feeHandler.address, expandDecimals(40_000, 18));

    await gmx.mint(user0.address, expandDecimals(40_000, 18));
    await gmx.mint(feeDistributorVault.address, expandDecimals(120_000, 18));
    await gmx.mint(user1.address, expandDecimals(10_000, 18));

    await wallet.sendTransaction({
      to: feeDistributor.address,
      value: expandDecimals(1, 18),
    });

    let wntPrice = await wethPriceFeed.latestAnswer();
    expect(wntPrice).to.eq(expandDecimals(5_000, 8));

    let gmxPrice = await gmxPriceFeed.latestAnswer();
    expect(gmxPrice).to.eq(expandDecimals(20, 8));

    const tx = await feeDistributor.initiateDistribute();
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt.blockNumber);
    const timestamp = block.timestamp;

    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);

    const distributeTimestamp = await dataStore.getUint(keys.FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP);

    const feeDistributionInitiatedEventData = parseLogs(fixture, receipt)[15].parsedEventData;
    const feeDistributionDataReceived = parseLogs(fixture, receipt)[12].parsedEventData;
    const feeDistributionGmxBridgedOut = parseLogs(fixture, receipt)[11].parsedEventData;

    const feeAmountGmx1 = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainId1));
    const feeAmountGmx2 = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainId2));
    const feeAmountGmx3 = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainId3));
    const totalFeeAmountGmx = await dataStore.getUint(keys.FEE_DISTRIBUTOR_TOTAL_FEE_AMOUNT_GMX);

    const stakedGmx1 = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainId1));
    const stakedGmx2 = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainId2));
    const stakedGmx3 = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainId3));
    const totalStakedGmx = await dataStore.getUint(keys.FEE_DISTRIBUTOR_TOTAL_STAKED_GMX);

    wntPrice = await dataStore.getUint(keys.FEE_DISTRIBUTOR_WNT_PRICE);
    gmxPrice = await dataStore.getUint(keys.FEE_DISTRIBUTOR_GMX_PRICE);

    const feeAmountAfterBridging1 = await gmx.balanceOf(user0.address);
    const feeAmountAfterBridging2 = await gmx.balanceOf(feeDistributorVault.address);
    const feeAmountAfterBridging3 = await gmx.balanceOf(user1.address);

    expect(distributionState).to.eq(3);

    expect(distributeTimestamp).to.equal(timestamp);

    expect(feeDistributionInitiatedEventData.numberOfChainsReadRequests).to.equal(2);
    expect(feeDistributionDataReceived.isBridgingCompleted).is.true;
    expect(feeDistributionGmxBridgedOut.totalGmxBridgedOut).to.equal(expandDecimals(40_000, 18));

    expect(feeAmountGmx1).to.equal(expandDecimals(50_000, 18));
    expect(feeAmountGmx2).to.equal(expandDecimals(120_000, 18));
    expect(feeAmountGmx3).to.equal(expandDecimals(30_000, 18));
    expect(totalFeeAmountGmx).to.equal(expandDecimals(240_000, 18));

    expect(stakedGmx1).to.equal(expandDecimals(3_000_000, 18));
    expect(stakedGmx2).to.equal(expandDecimals(6_000_000, 18));
    expect(stakedGmx3).to.equal(expandDecimals(3_000_000, 18));
    expect(totalStakedGmx).to.equal(expandDecimals(12_000_000, 18));

    expect(wntPrice).to.equal(expandDecimals(5_000, 12));
    expect(gmxPrice).to.equal(expandDecimals(20, 12));

    expect(feeAmountAfterBridging1).to.equal(expandDecimals(49_900, 18));
    expect(feeAmountAfterBridging2).to.equal(expandDecimals(120_000, 18));
    expect(feeAmountAfterBridging3).to.equal(expandDecimals(39_700, 18));

    const keeper1BalancePreDistribute = await ethers.provider.getBalance(user2.address);
    const keeper2BalancePreDistribute = await ethers.provider.getBalance(user3.address);
    const totalWntBalance = await wnt.balanceOf(feeDistributorVault.address);

    const distributeTx = await feeDistributor.distribute(
      wntReferralRewardsInUsd,
      esGmxForReferralRewards,
      feesV1Usd,
      feesV2Usd
    );
    const distributeReceipt = await distributeTx.wait();
    const distributeEventData = parseLogs(fixture, distributeReceipt)[7].parsedEventData;

    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);

    const keeperCosts = await dataStore.getUintArray(keys.FEE_DISTRIBUTOR_KEEPER_COSTS);

    const keeper1Balance = await ethers.provider.getBalance(user2.address);
    const keeper2Balance = await ethers.provider.getBalance(user3.address);
    const keeper3Balance = await ethers.provider.getBalance(user4.address);

    const sentToKeeper1 = keeperCosts[0].sub(keeper1BalancePreDistribute);
    const sentToKeeper2 = keeperCosts[1].sub(keeper2BalancePreDistribute);
    const glpFactor = await dataStore.getUint(keys.FEE_DISTRIBUTOR_KEEPER_GLP_FACTOR);
    const sentToKeeper2GlpCost = sentToKeeper2.mul(glpFactor).div(expandDecimals(1, 30));
    const sentToKeeper2TreasuryCost = sentToKeeper2.sub(sentToKeeper2GlpCost);
    const keeperCostsGlp = sentToKeeper2GlpCost;
    const keeperCostsTreasury = sentToKeeper1.add(sentToKeeper2TreasuryCost);
    const wntForKeepers = sentToKeeper1.add(sentToKeeper2);
    const totalFees = feesV1Usd.add(feesV2Usd);
    const chainlinkTreasuryWntAmount = totalWntBalance.mul(feesV2Usd).div(totalFees);
    const chainlinkFactor = await dataStore.getUint(keys.FEE_DISTRIBUTOR_CHAINLINK_FACTOR);
    const wntForChainlink = chainlinkTreasuryWntAmount.mul(chainlinkFactor).div(expandDecimals(1, 30));
    const wntForTreasury = chainlinkTreasuryWntAmount.sub(wntForChainlink).sub(keeperCostsTreasury);
    const wntForReferralRewards = wntReferralRewardsInUsd.div(wntPrice);
    const wntForGlp = totalWntBalance
      .sub(keeperCostsGlp)
      .sub(keeperCostsTreasury)
      .sub(wntForChainlink)
      .sub(wntForTreasury)
      .sub(wntForReferralRewards);

    expect(distributionState).to.eq(0);

    expect(keeper1Balance).to.eq(keeperCosts[0]);
    expect(keeper2Balance).to.eq(keeperCosts[1]);
    expect(keeper3Balance).gte(keeperCosts[2]);

    expect(distributeEventData.feesV1Usd).to.eq(feesV1Usd);
    expect(distributeEventData.feesV2Usd).to.eq(feesV2Usd);
    expect(distributeEventData.wntForKeepers).to.eq(wntForKeepers);
    expect(distributeEventData.wntForChainlink).to.eq(wntForChainlink);
    expect(distributeEventData.wntForTreasury).to.eq(wntForTreasury);
    expect(distributeEventData.wntForGlp).to.eq(wntForGlp);
    expect(distributeEventData.wntForReferralRewards).to.eq(wntForReferralRewards);
    expect(distributeEventData.esGmxForReferralRewards).to.eq(esGmxForReferralRewards);

    await feeDistributor.sendReferralRewards(
      wnt.address,
      5,
      [user7.address, user8.address, wallet.address],
      [expandDecimals(8, 16), expandDecimals(5, 16), expandDecimals(7, 16)]
    );

    await feeDistributor.sendReferralRewards(
      esGmx.address,
      5,
      [user7.address, user8.address, wallet.address],
      [expandDecimals(50, 18), expandDecimals(20, 18), expandDecimals(30, 18)]
    );
  });
});
