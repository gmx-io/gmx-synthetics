import { Options } from "@layerzerolabs/lz-v2-utilities";
import { addressToBytes32 } from "@layerzerolabs/lz-v2-utilities";

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
    mockLzReadResponseChainA,
    mockExtendedGmxTracker,
    mockLzReadResponseChainC,
    mockFeeGlpTracker,
    mockVester,
    mockEndpointV2A,
    mockEndpointV2B,
    mockEndpointV2C,
    mockOftA,
    mockOftAdapterB,
    mockOftC,
    initialTimestamp,
    chainlinkPriceFeedProvider,
    wethPriceFeed,
    gmxPriceFeed,
    oracle,
    eventEmitter,
    configUtils,
    marketUtils,
    feeDistributorUtils,
    mockVaultV1,
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
    signer0,
    signer1,
    signer2,
    signer3,
    signer4,
    signer5,
    signer6,
    signer7,
    distributionState,
    wntReferralRewardsInUsd,
    esGmxForReferralRewards,
    chainIds,
    options,
    feesV1Usd,
    feesV2Usd;

  // Constants representing mock Endpoint IDs for testing purposes
  const eidA = 1000;
  const eidB = 2000;
  const eidC = 3000;

  // Constants representing chain ID for testing purposes
  const chainIdA = 10000;
  const chainIdB = 31337;
  const chainIdC = 30000;
  chainIds = [chainIdA, chainIdB, chainIdC];

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
      oracle,
      eventEmitter,
      configUtils,
      marketUtils,
      feeDistributorUtils,
      mockVaultV1,
    } = fixture.contracts);

    ({
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
      signer0,
      signer1,
      signer2,
      signer3,
      signer4,
      signer5,
      signer6,
      signer7,
    } = fixture.accounts);

    mockExtendedGmxDistributor = await deployContract("MockRewardDistributorV1", []);
    mockFeeGlpDistributor = await deployContract("MockRewardDistributorV1", []);
    mockLzReadResponseChainA = await deployContract("MockLzReadResponse", []);
    mockExtendedGmxTracker = await deployContract("MockRewardTrackerV1", [mockExtendedGmxDistributor.address]);
    mockLzReadResponseChainC = await deployContract("MockLzReadResponse", []);
    mockFeeGlpTracker = await deployContract("MockRewardTrackerV1", [mockFeeGlpDistributor.address]);
    mockVester = await deployContract("MockVesterV1", [
      [user7.address, user8.address, wallet.address],
      [expandDecimals(10, 18), expandDecimals(30, 18), expandDecimals(20, 18)],
    ]);
    mockEndpointV2A = await deployContract("MockEndpointV2", [eidA]);
    // use separate mockEndpointV2B endpoint to avoid reentrancy issues when using mockEndpointV2
    mockEndpointV2B = await deployContract("MockEndpointV2", [eidB]);
    mockEndpointV2C = await deployContract("MockEndpointV2", [eidC]);
    mockOftA = await deployContract("MockOFT", ["GMX", "GMX", mockEndpointV2A.address, wallet.address]);
    mockOftAdapterB = await deployContract("MockOFTAdapter", [gmx.address, mockEndpointV2B.address, wallet.address]);
    mockOftC = await deployContract("MockOFT", ["GMX", "GMX", mockEndpointV2C.address, wallet.address]);

    await grantRole(roleStore, wallet.address, "FEE_DISTRIBUTION_KEEPER");

    options = Options.newOptions().addExecutorLzReceiveOption(65000, 0).toHex().toString();

    // set mock contract values
    await mockEndpointV2.setDestLzEndpoint(multichainReader.address, mockEndpointV2.address);
    await mockEndpointV2.setReadChannelId(channelId);

    await mockEndpointV2A.setDestLzEndpoint(mockOftAdapterB.address, mockEndpointV2B.address);
    await mockEndpointV2A.setDestLzEndpoint(mockOftC.address, mockEndpointV2C.address);

    await mockEndpointV2B.setDestLzEndpoint(mockOftA.address, mockEndpointV2A.address);
    await mockEndpointV2B.setDestLzEndpoint(mockOftC.address, mockEndpointV2C.address);

    await mockEndpointV2C.setDestLzEndpoint(mockOftA.address, mockEndpointV2A.address);
    await mockEndpointV2C.setDestLzEndpoint(mockOftAdapterB.address, mockEndpointV2B.address);

    await mockOftA.setPeer(eidB, ethers.utils.zeroPad(mockOftAdapterB.address, 32));
    await mockOftA.setPeer(eidC, ethers.utils.zeroPad(mockOftC.address, 32));
    await mockOftA.setEnforcedOptions([{ eid: eidB, msgType: 1, options: options }]);
    await mockOftA.setEnforcedOptions([{ eid: eidC, msgType: 1, options: options }]);

    await mockOftAdapterB.setPeer(eidA, ethers.utils.zeroPad(mockOftA.address, 32));
    await mockOftAdapterB.setPeer(eidC, ethers.utils.zeroPad(mockOftC.address, 32));
    await mockOftAdapterB.setEnforcedOptions([{ eid: eidA, msgType: 1, options: options }]);
    await mockOftAdapterB.setEnforcedOptions([{ eid: eidC, msgType: 1, options: options }]);

    await mockOftC.setPeer(eidA, ethers.utils.zeroPad(mockOftA.address, 32));
    await mockOftC.setPeer(eidB, ethers.utils.zeroPad(mockOftAdapterB.address, 32));
    await mockOftC.setEnforcedOptions([{ eid: eidA, msgType: 1, options: options }]);
    await mockOftC.setEnforcedOptions([{ eid: eidB, msgType: 1, options: options }]);

    // Setting LZRead configuration in dataStore for multichainReader
    await config.setBool(
      keys.MULTICHAIN_AUTHORIZED_ORIGINATORS,
      encodeData(["address"], [feeDistributor.address]),
      "true"
    );
    await config.setUint(keys.MULTICHAIN_READ_CHANNEL, "0x", channelId);
    await config.setBytes32(
      keys.MULTICHAIN_PEERS,
      encodeData(["uint256"], [channelId]),
      ethers.utils.hexZeroPad(multichainReader.address, 32)
    );
    for (const eid of [eidA, eidB, eidC]) {
      await config.setUint(keys.MULTICHAIN_CONFIRMATIONS, encodeData(["uint256"], [eid]), numberOfConfirmations);
    }

    // Setting feeDistributor configuration in config and dataStore
    await config.setUint(keys.FEE_DISTRIBUTOR_DISTRIBUTION_DAY, "0x", distributionDay);
    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);
    const block = await ethers.provider.getBlock("latest");
    initialTimestamp = block.timestamp;
    await dataStore.setUint(keys.FEE_DISTRIBUTOR_DISTRIBUTION_TIMESTAMP, initialTimestamp);

    await config.setUint(keys.FEE_DISTRIBUTOR_MAX_REFERRAL_REWARDS_WNT_USD_AMOUNT, "0x", expandDecimals(1_000_000, 30));
    await config.setUint(keys.FEE_DISTRIBUTOR_MAX_REFERRAL_REWARDS_ESGMX_AMOUNT, "0x", expandDecimals(10, 18));
    await config.setUint(keys.FEE_DISTRIBUTOR_MAX_READ_RESPONSE_DELAY, "0x", 600);
    await config.setUint(keys.FEE_DISTRIBUTOR_GAS_LIMIT, "0x", 5_000_000);
    await dataStore.setUintArray(keys.FEE_DISTRIBUTOR_CHAIN_ID, chainIds);
    await config.setUint(keys.FEE_DISTRIBUTOR_LAYERZERO_CHAIN_ID, encodeData(["uint256"], [chainIdA]), eidA);
    await config.setUint(keys.FEE_DISTRIBUTOR_LAYERZERO_CHAIN_ID, encodeData(["uint256"], [chainIdB]), eidB);
    await config.setUint(keys.FEE_DISTRIBUTOR_LAYERZERO_CHAIN_ID, encodeData(["uint256"], [chainIdC]), eidC);
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainIdA, feeDistributorConfig.gmxKey]),
      mockOftA.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainIdB, feeDistributorConfig.gmxKey]),
      gmx.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainIdC, feeDistributorConfig.gmxKey]),
      mockOftC.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainIdA, feeDistributorConfig.extendedGmxTrackerKey]),
      mockLzReadResponseChainA.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainIdB, feeDistributorConfig.extendedGmxTrackerKey]),
      mockExtendedGmxTracker.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainIdC, feeDistributorConfig.extendedGmxTrackerKey]),
      mockLzReadResponseChainC.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainIdA, feeDistributorConfig.dataStoreKey]),
      mockLzReadResponseChainA.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainIdC, feeDistributorConfig.dataStoreKey]),
      mockLzReadResponseChainC.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainIdB, feeDistributorConfig.feeGlpTrackerKey]),
      mockFeeGlpTracker.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainIdA, keys.FEE_RECEIVER]),
      user0.address
    );
    await dataStore.setAddress(keys.FEE_RECEIVER, feeDistributorVault.address);
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainIdC, keys.FEE_RECEIVER]),
      user1.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainIdB, feeDistributorConfig.layerzeroOftKey]),
      mockOftAdapterB.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainIdB, feeDistributorConfig.chainlinkKey]),
      user5.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainIdB, feeDistributorConfig.treasuryKey]),
      user6.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainIdB, feeDistributorConfig.esGmxVesterKey]),
      mockVester.address
    );
    await config.setUint(
      keys.FEE_DISTRIBUTOR_BRIDGE_SLIPPAGE_FACTOR,
      encodeData(["uint256"], [chainIdA]),
      expandDecimals(99, 28)
    );
    await config.setUint(
      keys.FEE_DISTRIBUTOR_BRIDGE_SLIPPAGE_FACTOR,
      encodeData(["uint256"], [chainIdB]),
      expandDecimals(99, 28)
    );
    await config.setUint(
      keys.FEE_DISTRIBUTOR_BRIDGE_SLIPPAGE_FACTOR,
      encodeData(["uint256"], [chainIdC]),
      expandDecimals(99, 28)
    );
    await config.setUint(
      keys.MAX_FEE_DISTRIBUTOR_FACTOR,
      encodeData(["bytes32"], [feeDistributorConfig.referralRewardsWntKey]),
      expandDecimals(20, 28)
    );
    await config.setUint(
      keys.MIN_FEE_DISTRIBUTOR_FACTOR,
      encodeData(["bytes32"], [feeDistributorConfig.glpKey]),
      expandDecimals(80, 28)
    );
    await config.setUint(
      keys.MIN_FEE_DISTRIBUTOR_FACTOR,
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
    esGmxForReferralRewards = expandDecimals(10, 18);
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

    await mockLzReadResponseChainA.setTotalSupply(expandDecimals(6_000_000, 18));
    await mockExtendedGmxTracker.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockLzReadResponseChainC.setTotalSupply(expandDecimals(3_000_000, 18));

    await mockLzReadResponseChainA.setUint(
      keys.withdrawableBuybackTokenAmountKey(mockOftA.address),
      expandDecimals(40_000, 18)
    );
    await mockLzReadResponseChainC.setUint(
      keys.withdrawableBuybackTokenAmountKey(mockOftC.address),
      expandDecimals(20_000, 18)
    );
    await dataStore.setUint(keys.withdrawableBuybackTokenAmountKey(gmx.address), expandDecimals(10_000, 18));
    await gmx.mint(feeHandler.address, expandDecimals(10_000, 18));

    await gmx.mint(wallet.address, expandDecimals(170_000, 18));
    await gmx.approve(mockOftAdapterB.address, expandDecimals(130_000, 18));
    let sendParam = {
      dstEid: eidA,
      to: addressToBytes32(user0.address),
      amountLD: expandDecimals(120_000, 18),
      minAmountLD: expandDecimals(120_000, 18),
      extraOptions: ethers.utils.arrayify("0x"),
      composeMsg: ethers.utils.arrayify("0x"),
      oftCmd: ethers.utils.arrayify("0x"),
    };
    let feeQuote = await mockOftAdapterB.quoteSend(sendParam, false);
    let nativeFee = feeQuote.nativeFee;
    await mockOftAdapterB.send(sendParam, { nativeFee: nativeFee, lzTokenFee: 0 }, wallet.address, {
      value: nativeFee,
    });

    await gmx.transfer(feeDistributorVault.address, expandDecimals(40_000, 18));

    sendParam = {
      dstEid: eidC,
      to: addressToBytes32(user1.address),
      amountLD: expandDecimals(10_000, 18),
      minAmountLD: expandDecimals(10_000, 18),
      extraOptions: ethers.utils.arrayify("0x"),
      composeMsg: ethers.utils.arrayify("0x"),
      oftCmd: ethers.utils.arrayify("0x"),
    };
    feeQuote = await mockOftAdapterB.quoteSend(sendParam, false);
    nativeFee = feeQuote.nativeFee;
    await mockOftAdapterB.send(sendParam, { nativeFee: nativeFee, lzTokenFee: 0 }, wallet.address, {
      value: nativeFee,
    });

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

    const feeAmountGmxA = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdA));
    const feeAmountGmxB = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdB));
    const feeAmountGmxC = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdC));
    const totalFeeAmountGmx = await dataStore.getUint(keys.FEE_DISTRIBUTOR_TOTAL_FEE_AMOUNT_GMX);

    const stakedGmxA = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainIdA));
    const stakedGmxB = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainIdB));
    const stakedGmxC = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainIdC));
    const totalStakedGmx = await dataStore.getUint(keys.FEE_DISTRIBUTOR_TOTAL_STAKED_GMX);

    wntPrice = await dataStore.getUint(keys.FEE_DISTRIBUTOR_WNT_PRICE);
    gmxPrice = await dataStore.getUint(keys.FEE_DISTRIBUTOR_GMX_PRICE);

    expect(distributeTimestamp).to.equal(timestamp);

    expect(feeDistributionInitiatedEventData.numberOfChainsReadRequests).to.equal(2);
    expect(feeDistributionDataReceived.isBridgingCompleted).is.false;

    expect(feeAmountGmxA).to.equal(expandDecimals(160_000, 18));
    expect(feeAmountGmxB).to.equal(expandDecimals(50_000, 18));
    expect(feeAmountGmxC).to.equal(expandDecimals(30_000, 18));
    expect(totalFeeAmountGmx).to.equal(expandDecimals(240_000, 18));

    expect(stakedGmxA).to.equal(expandDecimals(6_000_000, 18));
    expect(stakedGmxB).to.equal(expandDecimals(3_000_000, 18));
    expect(stakedGmxC).to.equal(expandDecimals(3_000_000, 18));
    expect(totalStakedGmx).to.equal(expandDecimals(12_000_000, 18));

    expect(wntPrice).to.equal(expandDecimals(5_000, 12));
    expect(gmxPrice).to.equal(expandDecimals(20, 12));
  });

  it("initiateDistribute() and processLzReceive() for fee surplus", async function () {
    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);
    expect(distributionState).to.eq(0);

    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    await mockLzReadResponseChainA.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockExtendedGmxTracker.setTotalSupply(expandDecimals(6_000_000, 18));
    await mockLzReadResponseChainC.setTotalSupply(expandDecimals(3_000_000, 18));

    await mockLzReadResponseChainA.setUint(
      keys.withdrawableBuybackTokenAmountKey(mockOftA.address),
      expandDecimals(10_000, 18)
    );
    await mockLzReadResponseChainC.setUint(
      keys.withdrawableBuybackTokenAmountKey(mockOftC.address),
      expandDecimals(20_000, 18)
    );
    await dataStore.setUint(keys.withdrawableBuybackTokenAmountKey(gmx.address), expandDecimals(40_000, 18));
    await gmx.mint(feeHandler.address, expandDecimals(40_000, 18));

    await gmx.mint(wallet.address, expandDecimals(170_000, 18));
    await gmx.approve(mockOftAdapterB.address, expandDecimals(50_000, 18));
    let sendParam = {
      dstEid: eidA,
      to: addressToBytes32(user0.address),
      amountLD: expandDecimals(40_000, 18),
      minAmountLD: expandDecimals(40_000, 18),
      extraOptions: ethers.utils.arrayify("0x"),
      composeMsg: ethers.utils.arrayify("0x"),
      oftCmd: ethers.utils.arrayify("0x"),
    };
    let feeQuote = await mockOftAdapterB.quoteSend(sendParam, false);
    let nativeFee = feeQuote.nativeFee;
    await mockOftAdapterB.send(sendParam, { nativeFee: nativeFee, lzTokenFee: 0 }, wallet.address, {
      value: nativeFee,
    });

    await gmx.transfer(feeDistributorVault.address, expandDecimals(120_000, 18));

    sendParam = {
      dstEid: eidC,
      to: addressToBytes32(user1.address),
      amountLD: expandDecimals(10_000, 18),
      minAmountLD: expandDecimals(10_000, 18),
      extraOptions: ethers.utils.arrayify("0x"),
      composeMsg: ethers.utils.arrayify("0x"),
      oftCmd: ethers.utils.arrayify("0x"),
    };
    feeQuote = await mockOftAdapterB.quoteSend(sendParam, false);
    nativeFee = feeQuote.nativeFee;
    await mockOftAdapterB.send(sendParam, { nativeFee: nativeFee, lzTokenFee: 0 }, wallet.address, {
      value: nativeFee,
    });

    await wallet.sendTransaction({
      to: feeDistributor.address,
      value: expandDecimals(1, 18),
    });

    let wntPrice = await wethPriceFeed.latestAnswer();
    expect(wntPrice).to.eq(expandDecimals(5_000, 8));

    let gmxPrice = await gmxPriceFeed.latestAnswer();
    expect(gmxPrice).to.eq(expandDecimals(20, 8));

    const feeReceiverAmountBeforeBridgingA = await mockOftA.balanceOf(user0.address);
    const feeReceiverAmountBeforeBridgingB = await gmx.balanceOf(feeDistributorVault.address);
    const feeReceiverAmountBeforeBridgingC = await mockOftC.balanceOf(user1.address);

    const tx = await feeDistributor.initiateDistribute();
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt.blockNumber);
    const timestamp = block.timestamp;

    const distributeTimestamp = await dataStore.getUint(keys.FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP);

    const feeDistributionInitiatedEventData = parseLogs(fixture, receipt)[21].parsedEventData;
    const feeDistributionDataReceived = parseLogs(fixture, receipt)[18].parsedEventData;
    const feeDistributionGmxBridgedOut = parseLogs(fixture, receipt)[17].parsedEventData;

    const feeAmountGmxA = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdA));
    const feeAmountGmxB = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdB));
    const feeAmountGmxC = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdC));
    const totalFeeAmountGmx = await dataStore.getUint(keys.FEE_DISTRIBUTOR_TOTAL_FEE_AMOUNT_GMX);

    const stakedGmxA = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainIdA));
    const stakedGmxB = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainIdB));
    const stakedGmxC = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainIdC));
    const totalStakedGmx = await dataStore.getUint(keys.FEE_DISTRIBUTOR_TOTAL_STAKED_GMX);

    wntPrice = await dataStore.getUint(keys.FEE_DISTRIBUTOR_WNT_PRICE);
    gmxPrice = await dataStore.getUint(keys.FEE_DISTRIBUTOR_GMX_PRICE);

    const feeReceiverAmountAfterBridgingA = await mockOftA.balanceOf(user0.address);
    const feeReceiverAmountAfterBridgingB = await gmx.balanceOf(feeDistributorVault.address);
    const feeReceiverAmountAfterBridgingC = await mockOftC.balanceOf(user1.address);

    expect(distributeTimestamp).to.equal(timestamp);

    expect(feeDistributionInitiatedEventData.numberOfChainsReadRequests).to.equal(2);
    expect(feeDistributionDataReceived.isBridgingCompleted).is.true;
    expect(feeDistributionGmxBridgedOut.totalGmxBridgedOut).to.equal(expandDecimals(40_000, 18));

    expect(feeAmountGmxA).to.equal(expandDecimals(50_000, 18));
    expect(feeAmountGmxB).to.equal(expandDecimals(120_000, 18));
    expect(feeAmountGmxC).to.equal(expandDecimals(30_000, 18));
    expect(totalFeeAmountGmx).to.equal(expandDecimals(240_000, 18));

    expect(stakedGmxA).to.equal(expandDecimals(3_000_000, 18));
    expect(stakedGmxB).to.equal(expandDecimals(6_000_000, 18));
    expect(stakedGmxC).to.equal(expandDecimals(3_000_000, 18));
    expect(totalStakedGmx).to.equal(expandDecimals(12_000_000, 18));

    expect(wntPrice).to.equal(expandDecimals(5_000, 12));
    expect(gmxPrice).to.equal(expandDecimals(20, 12));

    expect(feeReceiverAmountBeforeBridgingA).to.equal(expandDecimals(40_000, 18));
    expect(feeReceiverAmountBeforeBridgingB).to.equal(expandDecimals(120_000, 18));
    expect(feeReceiverAmountBeforeBridgingC).to.equal(expandDecimals(10_000, 18));

    expect(feeReceiverAmountAfterBridgingA).to.equal(expandDecimals(50_000, 18));
    expect(feeReceiverAmountAfterBridgingB).to.equal(expandDecimals(120_000, 18));
    expect(feeReceiverAmountAfterBridgingC).to.equal(expandDecimals(40_000, 18));
  });

  it("distribute() and sendReferralRewards() for fee deficit", async function () {
    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);
    expect(distributionState).to.eq(0);

    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    await mockLzReadResponseChainA.setTotalSupply(expandDecimals(6_000_000, 18));
    await mockExtendedGmxTracker.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockLzReadResponseChainC.setTotalSupply(expandDecimals(3_000_000, 18));

    await mockLzReadResponseChainA.setUint(
      keys.withdrawableBuybackTokenAmountKey(mockOftA.address),
      expandDecimals(40_000, 18)
    );
    await mockLzReadResponseChainC.setUint(
      keys.withdrawableBuybackTokenAmountKey(mockOftC.address),
      expandDecimals(20_000, 18)
    );
    await dataStore.setUint(keys.withdrawableBuybackTokenAmountKey(gmx.address), expandDecimals(10_000, 18));
    await gmx.mint(feeHandler.address, expandDecimals(10_000, 18));

    await gmx.mint(wallet.address, expandDecimals(170_000, 18));
    await gmx.approve(mockOftAdapterB.address, expandDecimals(130_000, 18));
    let sendParam = {
      dstEid: eidA,
      to: addressToBytes32(user0.address),
      amountLD: expandDecimals(120_000, 18),
      minAmountLD: expandDecimals(120_000, 18),
      extraOptions: ethers.utils.arrayify("0x"),
      composeMsg: ethers.utils.arrayify("0x"),
      oftCmd: ethers.utils.arrayify("0x"),
    };
    let feeQuote = await mockOftAdapterB.quoteSend(sendParam, false);
    let nativeFee = feeQuote.nativeFee;
    await mockOftAdapterB.send(sendParam, { nativeFee: nativeFee, lzTokenFee: 0 }, wallet.address, {
      value: nativeFee,
    });

    await gmx.transfer(feeDistributorVault.address, expandDecimals(40_000, 18));

    sendParam = {
      dstEid: eidC,
      to: addressToBytes32(user1.address),
      amountLD: expandDecimals(10_000, 18),
      minAmountLD: expandDecimals(10_000, 18),
      extraOptions: ethers.utils.arrayify("0x"),
      composeMsg: ethers.utils.arrayify("0x"),
      oftCmd: ethers.utils.arrayify("0x"),
    };
    feeQuote = await mockOftAdapterB.quoteSend(sendParam, false);
    nativeFee = feeQuote.nativeFee;
    await mockOftAdapterB.send(sendParam, { nativeFee: nativeFee, lzTokenFee: 0 }, wallet.address, {
      value: nativeFee,
    });

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

    const feeAmountGmxA = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdA));
    const feeAmountGmxB = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdB));
    const feeAmountGmxC = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdC));
    const totalFeeAmountGmx = await dataStore.getUint(keys.FEE_DISTRIBUTOR_TOTAL_FEE_AMOUNT_GMX);

    const stakedGmxA = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainIdA));
    const stakedGmxB = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainIdB));
    const stakedGmxC = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainIdC));
    const totalStakedGmx = await dataStore.getUint(keys.FEE_DISTRIBUTOR_TOTAL_STAKED_GMX);

    wntPrice = await dataStore.getUint(keys.FEE_DISTRIBUTOR_WNT_PRICE);
    gmxPrice = await dataStore.getUint(keys.FEE_DISTRIBUTOR_GMX_PRICE);

    expect(distributionState).to.eq(2);

    expect(distributeTimestamp).to.equal(timestamp);

    expect(feeDistributionInitiatedEventData.numberOfChainsReadRequests).to.equal(2);
    expect(feeDistributionDataReceived.isBridgingCompleted).is.false;

    expect(feeAmountGmxA).to.equal(expandDecimals(160_000, 18));
    expect(feeAmountGmxB).to.equal(expandDecimals(50_000, 18));
    expect(feeAmountGmxC).to.equal(expandDecimals(30_000, 18));
    expect(totalFeeAmountGmx).to.equal(expandDecimals(240_000, 18));

    expect(stakedGmxA).to.equal(expandDecimals(6_000_000, 18));
    expect(stakedGmxB).to.equal(expandDecimals(3_000_000, 18));
    expect(stakedGmxC).to.equal(expandDecimals(3_000_000, 18));
    expect(totalStakedGmx).to.equal(expandDecimals(12_000_000, 18));

    expect(wntPrice).to.equal(expandDecimals(5_000, 12));
    expect(gmxPrice).to.equal(expandDecimals(20, 12));

    sendParam = {
      dstEid: eidB,
      to: addressToBytes32(feeDistributorVault.address),
      amountLD: expandDecimals(10_000, 18),
      minAmountLD: expandDecimals(10_000, 18),
      extraOptions: ethers.utils.arrayify("0x"),
      composeMsg: ethers.utils.arrayify("0x"),
      oftCmd: ethers.utils.arrayify("0x"),
    };
    feeQuote = await mockOftA.quoteSend(sendParam, false);
    nativeFee = feeQuote.nativeFee;
    await mockOftA.connect(user0).send(sendParam, { nativeFee: nativeFee, lzTokenFee: 0 }, user0.address, {
      value: nativeFee,
    });

    sendParam = {
      dstEid: eidC,
      to: addressToBytes32(user1.address),
      amountLD: expandDecimals(30_000, 18),
      minAmountLD: expandDecimals(30_000, 18),
      extraOptions: ethers.utils.arrayify("0x"),
      composeMsg: ethers.utils.arrayify("0x"),
      oftCmd: ethers.utils.arrayify("0x"),
    };
    feeQuote = await mockOftA.quoteSend(sendParam, false);
    nativeFee = feeQuote.nativeFee;
    await mockOftA.connect(user0).send(sendParam, { nativeFee: nativeFee, lzTokenFee: 0 }, user0.address, {
      value: nativeFee,
    });

    const user0Balance = await mockOftA.balanceOf(user0.address);
    const feeDistributorVaultBalance = await gmx.balanceOf(feeDistributorVault.address);
    const user1Balance = await mockOftC.balanceOf(user1.address);

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
      [expandDecimals(5, 18), expandDecimals(2, 18), expandDecimals(3, 18)]
    );
  });

  it("distribute() and sendReferralRewards() for fee surplus", async function () {
    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);
    expect(distributionState).to.eq(0);

    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    await mockLzReadResponseChainA.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockExtendedGmxTracker.setTotalSupply(expandDecimals(6_000_000, 18));
    await mockLzReadResponseChainC.setTotalSupply(expandDecimals(3_000_000, 18));

    await mockLzReadResponseChainA.setUint(
      keys.withdrawableBuybackTokenAmountKey(mockOftA.address),
      expandDecimals(10_000, 18)
    );
    await mockLzReadResponseChainC.setUint(
      keys.withdrawableBuybackTokenAmountKey(mockOftC.address),
      expandDecimals(20_000, 18)
    );
    await dataStore.setUint(keys.withdrawableBuybackTokenAmountKey(gmx.address), expandDecimals(40_000, 18));
    await gmx.mint(feeHandler.address, expandDecimals(40_000, 18));

    await gmx.mint(wallet.address, expandDecimals(170_000, 18));
    await gmx.approve(mockOftAdapterB.address, expandDecimals(50_000, 18));
    let sendParam = {
      dstEid: eidA,
      to: addressToBytes32(user0.address),
      amountLD: expandDecimals(40_000, 18),
      minAmountLD: expandDecimals(40_000, 18),
      extraOptions: ethers.utils.arrayify("0x"),
      composeMsg: ethers.utils.arrayify("0x"),
      oftCmd: ethers.utils.arrayify("0x"),
    };
    let feeQuote = await mockOftAdapterB.quoteSend(sendParam, false);
    let nativeFee = feeQuote.nativeFee;
    await mockOftAdapterB.send(sendParam, { nativeFee: nativeFee, lzTokenFee: 0 }, wallet.address, {
      value: nativeFee,
    });

    await gmx.transfer(feeDistributorVault.address, expandDecimals(120_000, 18));

    sendParam = {
      dstEid: eidC,
      to: addressToBytes32(user1.address),
      amountLD: expandDecimals(10_000, 18),
      minAmountLD: expandDecimals(10_000, 18),
      extraOptions: ethers.utils.arrayify("0x"),
      composeMsg: ethers.utils.arrayify("0x"),
      oftCmd: ethers.utils.arrayify("0x"),
    };
    feeQuote = await mockOftAdapterB.quoteSend(sendParam, false);
    nativeFee = feeQuote.nativeFee;
    await mockOftAdapterB.send(sendParam, { nativeFee: nativeFee, lzTokenFee: 0 }, wallet.address, {
      value: nativeFee,
    });

    await wallet.sendTransaction({
      to: feeDistributor.address,
      value: expandDecimals(1, 18),
    });

    let wntPrice = await wethPriceFeed.latestAnswer();
    expect(wntPrice).to.eq(expandDecimals(5_000, 8));

    let gmxPrice = await gmxPriceFeed.latestAnswer();
    expect(gmxPrice).to.eq(expandDecimals(20, 8));

    const feeReceiverAmountBeforeBridgingA = await mockOftA.balanceOf(user0.address);
    const feeReceiverAmountBeforeBridgingB = await gmx.balanceOf(feeDistributorVault.address);
    const feeReceiverAmountBeforeBridgingC = await mockOftC.balanceOf(user1.address);

    const tx = await feeDistributor.initiateDistribute();
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt.blockNumber);
    const timestamp = block.timestamp;

    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);

    const distributeTimestamp = await dataStore.getUint(keys.FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP);

    const feeDistributionInitiatedEventData = parseLogs(fixture, receipt)[21].parsedEventData;
    const feeDistributionDataReceived = parseLogs(fixture, receipt)[18].parsedEventData;
    const feeDistributionGmxBridgedOut = parseLogs(fixture, receipt)[17].parsedEventData;

    const feeAmountGmxA = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdA));
    const feeAmountGmxB = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdB));
    const feeAmountGmxC = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdC));
    const totalFeeAmountGmx = await dataStore.getUint(keys.FEE_DISTRIBUTOR_TOTAL_FEE_AMOUNT_GMX);

    const stakedGmxA = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainIdA));
    const stakedGmxB = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainIdB));
    const stakedGmxC = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainIdC));
    const totalStakedGmx = await dataStore.getUint(keys.FEE_DISTRIBUTOR_TOTAL_STAKED_GMX);

    wntPrice = await dataStore.getUint(keys.FEE_DISTRIBUTOR_WNT_PRICE);
    gmxPrice = await dataStore.getUint(keys.FEE_DISTRIBUTOR_GMX_PRICE);

    const feeReceiverAmountAfterBridgingA = await mockOftA.balanceOf(user0.address);
    const feeReceiverAmountAfterBridgingB = await gmx.balanceOf(feeDistributorVault.address);
    const feeReceiverAmountAfterBridgingC = await mockOftC.balanceOf(user1.address);

    expect(distributionState).to.eq(3);

    expect(distributeTimestamp).to.equal(timestamp);

    expect(feeDistributionInitiatedEventData.numberOfChainsReadRequests).to.equal(2);
    expect(feeDistributionDataReceived.isBridgingCompleted).is.true;
    expect(feeDistributionGmxBridgedOut.totalGmxBridgedOut).to.equal(expandDecimals(40_000, 18));

    expect(feeAmountGmxA).to.equal(expandDecimals(50_000, 18));
    expect(feeAmountGmxB).to.equal(expandDecimals(120_000, 18));
    expect(feeAmountGmxC).to.equal(expandDecimals(30_000, 18));
    expect(totalFeeAmountGmx).to.equal(expandDecimals(240_000, 18));

    expect(stakedGmxA).to.equal(expandDecimals(3_000_000, 18));
    expect(stakedGmxB).to.equal(expandDecimals(6_000_000, 18));
    expect(stakedGmxC).to.equal(expandDecimals(3_000_000, 18));
    expect(totalStakedGmx).to.equal(expandDecimals(12_000_000, 18));

    expect(wntPrice).to.equal(expandDecimals(5_000, 12));
    expect(gmxPrice).to.equal(expandDecimals(20, 12));

    expect(feeReceiverAmountBeforeBridgingA).to.equal(expandDecimals(40_000, 18));
    expect(feeReceiverAmountBeforeBridgingB).to.equal(expandDecimals(120_000, 18));
    expect(feeReceiverAmountBeforeBridgingC).to.equal(expandDecimals(10_000, 18));

    expect(feeReceiverAmountAfterBridgingA).to.equal(expandDecimals(50_000, 18));
    expect(feeReceiverAmountAfterBridgingB).to.equal(expandDecimals(120_000, 18));
    expect(feeReceiverAmountAfterBridgingC).to.equal(expandDecimals(40_000, 18));

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
      [expandDecimals(5, 18), expandDecimals(2, 18), expandDecimals(3, 18)]
    );
  });

  it("finalizeWntForTreasuryAndGlp GLP shortfall covered by Treasury", async () => {
    await config.setUint(
      keys.MIN_FEE_DISTRIBUTOR_FACTOR,
      encodeData(["bytes32"], [feeDistributorConfig.glpKey]),
      expandDecimals(80, 28)
    );
    await config.setUint(
      keys.MIN_FEE_DISTRIBUTOR_FACTOR,
      encodeData(["bytes32"], [feeDistributorConfig.treasuryKey]),
      expandDecimals(70, 28)
    );

    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    await mockLzReadResponseChainA.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockExtendedGmxTracker.setTotalSupply(expandDecimals(6_000_000, 18));
    await mockLzReadResponseChainC.setTotalSupply(expandDecimals(3_000_000, 18));

    await mockLzReadResponseChainA.setUint(
      keys.withdrawableBuybackTokenAmountKey(mockOftA.address),
      expandDecimals(10_000, 18)
    );
    await mockLzReadResponseChainC.setUint(
      keys.withdrawableBuybackTokenAmountKey(mockOftC.address),
      expandDecimals(20_000, 18)
    );
    await dataStore.setUint(keys.withdrawableBuybackTokenAmountKey(gmx.address), expandDecimals(40_000, 18));
    await gmx.mint(feeHandler.address, expandDecimals(40_000, 18));

    await gmx.mint(wallet.address, expandDecimals(170_000, 18));
    await gmx.transfer(feeDistributorVault.address, expandDecimals(120_000, 18));

    await wnt.burn(feeDistributorVault.address, await wnt.balanceOf(feeDistributorVault.address));

    await wnt.mint(feeDistributorVault.address, expandDecimals(1, 17));

    await wallet.sendTransaction({
      to: feeDistributor.address,
      value: expandDecimals(1, 18),
    });

    await feeDistributor.initiateDistribute();

    const feesV1Usd = expandDecimals(10_000, 30);
    const feesV2Usd = expandDecimals(40_000, 30);

    const keeperAddrs = await dataStore.getAddressArray(keys.FEE_DISTRIBUTOR_KEEPER_COSTS);
    const keeperTargets = await dataStore.getUintArray(keys.FEE_DISTRIBUTOR_KEEPER_COSTS);
    const keeperFlags = await dataStore.getBoolArray(keys.FEE_DISTRIBUTOR_KEEPER_COSTS);
    const keeperGlpFact = await dataStore.getUint(keys.FEE_DISTRIBUTOR_KEEPER_GLP_FACTOR);

    let keeperCostsTreasury = ethers.constants.Zero;
    let keeperCostsGlp = ethers.constants.Zero;

    for (let i = 0; i < keeperAddrs.length; i++) {
      const target = keeperTargets[i];
      const balance = await ethers.provider.getBalance(keeperAddrs[i]);
      if (target.lte(balance)) continue;

      const diff = target.sub(balance);

      if (keeperFlags[i]) {
        keeperCostsTreasury = keeperCostsTreasury.add(diff);
      } else {
        const glpPortion = diff.mul(keeperGlpFact).div(expandDecimals(1, 30));
        keeperCostsGlp = keeperCostsGlp.add(glpPortion);
        keeperCostsTreasury = keeperCostsTreasury.add(diff.sub(glpPortion));
      }
    }

    const totalWntBalance = await wnt.balanceOf(feeDistributorVault.address);

    const totalFeesUsd = feesV1Usd.add(feesV2Usd);
    const chainlinkTreasuryWnt = totalWntBalance.mul(feesV2Usd).div(totalFeesUsd);

    const chainlinkFactor = await dataStore.getUint(keys.FEE_DISTRIBUTOR_CHAINLINK_FACTOR);
    const wntForChainlink = chainlinkTreasuryWnt.mul(chainlinkFactor).div(expandDecimals(1, 30));
    const wntForTreasuryPre = chainlinkTreasuryWnt.sub(wntForChainlink).sub(keeperCostsTreasury);

    const expectedWntForGlp = totalWntBalance.sub(wntForChainlink).sub(wntForTreasuryPre).add(keeperCostsTreasury);

    const minGlpFeeFactor = await dataStore.getUint(keys.minFeeDistributorFactorKey(feeDistributorConfig.glpKey));
    const minGlp = expectedWntForGlp.mul(minGlpFeeFactor).div(expandDecimals(1, 30));

    await feeDistributor.distribute(0, 0, feesV1Usd, feesV2Usd);

    const glpAfter = await wnt.balanceOf(mockFeeGlpTracker.address);

    expect(glpAfter).to.equal(minGlp);
  });

  it("initiateDistribute() and processLzReceive() with 2 surplus and 2 deficit chains", async () => {
    const eidD = 4000;
    const chainIdD = 40000;

    chainIds = [chainIdA, chainIdB, chainIdC, chainIdD];
    const chainIdsD = [chainIdA, chainIdC, chainIdD, chainIdB];

    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);
    expect(distributionState).to.eq(0);

    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    const dataStoreD = await deployContract("DataStore", [roleStore.address]);
    const configD = await deployContract("Config", [roleStore.address, dataStoreD.address, eventEmitter.address], {
      libraries: {
        "contracts/config/ConfigUtils.sol:ConfigUtils": configUtils.address,
      },
    });
    const mockEndpointV2DMultichain = await deployContract("MockEndpointV2", [eidD]);
    const mockEndpointV2D = await deployContract("MockEndpointV2", [eidD]);
    const mockOftD = await deployContract("MockOFT", ["GMX", "GMX", mockEndpointV2D.address, wallet.address]);
    const feeHandlerD = await deployContract(
      "FeeHandler",
      [
        roleStore.address,
        oracle.address,
        dataStoreD.address,
        eventEmitter.address,
        mockVaultV1.address,
        mockOftD.address,
      ],
      {
        libraries: {
          "contracts/market/MarketUtils.sol:MarketUtils": marketUtils.address,
        },
      }
    );
    const feeDistributorVaultD = await deployContract("FeeDistributorVault", [roleStore.address, dataStoreD.address]);
    const multichainReaderD = await deployContract("MultichainReader", [
      roleStore.address,
      dataStoreD.address,
      eventEmitter.address,
      mockEndpointV2DMultichain.address,
    ]);
    const mockFeeDistributor = await deployContract(
      "MockFeeDistributor",
      [
        roleStore.address,
        oracle.address,
        feeDistributorVaultD.address,
        feeHandlerD.address,
        dataStoreD.address,
        eventEmitter.address,
        multichainReaderD.address,
        mockOftD.address,
        gmx.address,
        esGmx.address,
        wnt.address,
        chainIdD,
      ],
      {
        libraries: {
          "contracts/fee/FeeDistributorUtils.sol:FeeDistributorUtils": feeDistributorUtils.address,
        },
      }
    );

    const mockExtendedGmxDistributorD = await deployContract("MockRewardDistributorV1", []);
    const mockFeeGlpDistributorD = await deployContract("MockRewardDistributorV1", []);
    const mockExtendedGmxTrackerD = await deployContract("MockRewardTrackerV1", [mockExtendedGmxDistributorD.address]);
    const mockFeeGlpTrackerD = await deployContract("MockRewardTrackerV1", [mockFeeGlpDistributorD.address]);
    const mockVesterD = await deployContract("MockVesterV1", [
      [signer5.address, signer6.address, signer7.address],
      [expandDecimals(10, 18), expandDecimals(30, 18), expandDecimals(20, 18)],
    ]);

    await grantRole(roleStore, configD.address, "CONTROLLER");
    await grantRole(roleStore, multichainReaderD.address, "CONTROLLER");
    await grantRole(roleStore, multichainReaderD.address, "MULTICHAIN_READER");
    await grantRole(roleStore, feeHandlerD.address, "CONTROLLER");
    await grantRole(roleStore, mockFeeDistributor.address, "CONTROLLER");
    await grantRole(roleStore, mockFeeDistributor.address, "FEE_KEEPER");

    const testMockChainId = await mockFeeDistributor.mockChainId();
    expect(chainIdD).to.eq(testMockChainId);

    await mockEndpointV2DMultichain.setDestLzEndpoint(multichainReaderD.address, mockEndpointV2DMultichain.address);
    await mockEndpointV2DMultichain.setReadChannelId(channelId);

    await mockEndpointV2D.setDestLzEndpoint(mockOftA.address, mockEndpointV2A.address);
    await mockEndpointV2D.setDestLzEndpoint(mockOftAdapterB.address, mockEndpointV2B.address);
    await mockEndpointV2D.setDestLzEndpoint(mockOftC.address, mockEndpointV2C.address);

    await mockOftD.setPeer(eidA, ethers.utils.zeroPad(mockOftA.address, 32));
    await mockOftD.setPeer(eidB, ethers.utils.zeroPad(mockOftAdapterB.address, 32));
    await mockOftD.setPeer(eidC, ethers.utils.zeroPad(mockOftC.address, 32));
    await mockOftD.setEnforcedOptions([{ eid: eidA, msgType: 1, options: options }]);
    await mockOftD.setEnforcedOptions([{ eid: eidB, msgType: 1, options: options }]);
    await mockOftD.setEnforcedOptions([{ eid: eidC, msgType: 1, options: options }]);

    await mockEndpointV2A.setDestLzEndpoint(mockOftD.address, mockEndpointV2D.address);
    await mockEndpointV2B.setDestLzEndpoint(mockOftD.address, mockEndpointV2D.address);
    await mockEndpointV2C.setDestLzEndpoint(mockOftD.address, mockEndpointV2D.address);

    await mockOftA.setPeer(eidD, ethers.utils.zeroPad(mockOftD.address, 32));
    await mockOftA.setEnforcedOptions([{ eid: eidD, msgType: 1, options: options }]);

    await mockOftAdapterB.setPeer(eidD, ethers.utils.zeroPad(mockOftD.address, 32));
    await mockOftAdapterB.setEnforcedOptions([{ eid: eidD, msgType: 1, options: options }]);

    await mockOftC.setPeer(eidD, ethers.utils.zeroPad(mockOftD.address, 32));
    await mockOftC.setEnforcedOptions([{ eid: eidD, msgType: 1, options: options }]);

    await config.setUint(keys.MULTICHAIN_CONFIRMATIONS, encodeData(["uint256"], [eidD]), numberOfConfirmations);
    await dataStore.setUintArray(keys.FEE_DISTRIBUTOR_CHAIN_ID, chainIds);
    await config.setUint(keys.FEE_DISTRIBUTOR_LAYERZERO_CHAIN_ID, encodeData(["uint256"], [chainIdD]), eidD);
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainIdD, feeDistributorConfig.gmxKey]),
      mockOftD.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainIdD, feeDistributorConfig.extendedGmxTrackerKey]),
      mockExtendedGmxTrackerD.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainIdD, feeDistributorConfig.dataStoreKey]),
      dataStoreD.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainIdD, keys.FEE_RECEIVER]),
      feeDistributorVaultD.address
    );
    await config.setUint(
      keys.FEE_DISTRIBUTOR_BRIDGE_SLIPPAGE_FACTOR,
      encodeData(["uint256"], [chainIdD]),
      expandDecimals(99, 28)
    );

    // Setting LZRead configuration in dataStore for multichainReaderD
    await configD.setBool(
      keys.MULTICHAIN_AUTHORIZED_ORIGINATORS,
      encodeData(["address"], [mockFeeDistributor.address]),
      "true"
    );
    await configD.setUint(keys.MULTICHAIN_READ_CHANNEL, "0x", channelId);
    await configD.setBytes32(
      keys.MULTICHAIN_PEERS,
      encodeData(["uint256"], [channelId]),
      ethers.utils.hexZeroPad(multichainReaderD.address, 32)
    );
    for (const eid of [eidA, eidB, eidC, eidD]) {
      await configD.setUint(keys.MULTICHAIN_CONFIRMATIONS, encodeData(["uint256"], [eid]), numberOfConfirmations);
    }

    // Setting mockFeeDistributor configuration in config and dataStore
    await configD.setUint(keys.FEE_DISTRIBUTOR_DISTRIBUTION_DAY, "0x", distributionDay);
    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);
    const initialBlock = await ethers.provider.getBlock("latest");
    initialTimestamp = initialBlock.timestamp;
    await dataStore.setUint(keys.FEE_DISTRIBUTOR_DISTRIBUTION_TIMESTAMP, initialTimestamp);
    await dataStoreD.setUint(keys.FEE_DISTRIBUTOR_DISTRIBUTION_TIMESTAMP, initialTimestamp);

    await configD.setUint(
      keys.FEE_DISTRIBUTOR_MAX_REFERRAL_REWARDS_WNT_USD_AMOUNT,
      "0x",
      expandDecimals(1_000_000, 30)
    );
    await configD.setUint(keys.FEE_DISTRIBUTOR_MAX_REFERRAL_REWARDS_ESGMX_AMOUNT, "0x", expandDecimals(10, 18));
    await configD.setUint(keys.FEE_DISTRIBUTOR_MAX_READ_RESPONSE_DELAY, "0x", 600);
    await configD.setUint(keys.FEE_DISTRIBUTOR_GAS_LIMIT, "0x", 5_000_000);
    await dataStoreD.setUintArray(keys.FEE_DISTRIBUTOR_CHAIN_ID, chainIdsD);
    await configD.setUint(keys.FEE_DISTRIBUTOR_LAYERZERO_CHAIN_ID, encodeData(["uint256"], [chainIdA]), eidA);
    await configD.setUint(keys.FEE_DISTRIBUTOR_LAYERZERO_CHAIN_ID, encodeData(["uint256"], [chainIdB]), eidB);
    await configD.setUint(keys.FEE_DISTRIBUTOR_LAYERZERO_CHAIN_ID, encodeData(["uint256"], [chainIdC]), eidC);
    await configD.setUint(keys.FEE_DISTRIBUTOR_LAYERZERO_CHAIN_ID, encodeData(["uint256"], [chainIdD]), eidD);
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainIdA, feeDistributorConfig.gmxKey]),
      mockOftA.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainIdB, feeDistributorConfig.gmxKey]),
      gmx.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainIdC, feeDistributorConfig.gmxKey]),
      mockOftC.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainIdD, feeDistributorConfig.gmxKey]),
      mockOftD.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainIdA, feeDistributorConfig.extendedGmxTrackerKey]),
      mockLzReadResponseChainA.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainIdB, feeDistributorConfig.extendedGmxTrackerKey]),
      mockExtendedGmxTracker.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainIdC, feeDistributorConfig.extendedGmxTrackerKey]),
      mockLzReadResponseChainC.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainIdD, feeDistributorConfig.extendedGmxTrackerKey]),
      mockExtendedGmxTrackerD.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainIdA, feeDistributorConfig.dataStoreKey]),
      mockLzReadResponseChainA.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainIdB, feeDistributorConfig.dataStoreKey]),
      dataStore.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainIdC, feeDistributorConfig.dataStoreKey]),
      mockLzReadResponseChainC.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainIdD, feeDistributorConfig.feeGlpTrackerKey]),
      mockFeeGlpTrackerD.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainIdA, keys.FEE_RECEIVER]),
      user0.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainIdB, keys.FEE_RECEIVER]),
      feeDistributorVault.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainIdC, keys.FEE_RECEIVER]),
      user1.address
    );
    await dataStoreD.setAddress(keys.FEE_RECEIVER, feeDistributorVaultD.address);
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainIdD, feeDistributorConfig.layerzeroOftKey]),
      mockOftD.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainIdD, feeDistributorConfig.chainlinkKey]),
      signer0.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainIdD, feeDistributorConfig.treasuryKey]),
      signer1.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainIdD, feeDistributorConfig.esGmxVesterKey]),
      mockVesterD.address
    );
    await configD.setUint(
      keys.FEE_DISTRIBUTOR_BRIDGE_SLIPPAGE_FACTOR,
      encodeData(["uint256"], [chainIdA]),
      expandDecimals(99, 28)
    );
    await configD.setUint(
      keys.FEE_DISTRIBUTOR_BRIDGE_SLIPPAGE_FACTOR,
      encodeData(["uint256"], [chainIdB]),
      expandDecimals(99, 28)
    );
    await configD.setUint(
      keys.FEE_DISTRIBUTOR_BRIDGE_SLIPPAGE_FACTOR,
      encodeData(["uint256"], [chainIdC]),
      expandDecimals(99, 28)
    );
    await configD.setUint(
      keys.FEE_DISTRIBUTOR_BRIDGE_SLIPPAGE_FACTOR,
      encodeData(["uint256"], [chainIdD]),
      expandDecimals(99, 28)
    );
    await configD.setUint(
      keys.MAX_FEE_DISTRIBUTOR_FACTOR,
      encodeData(["bytes32"], [feeDistributorConfig.referralRewardsWntKey]),
      expandDecimals(20, 28)
    );
    await configD.setUint(
      keys.MIN_FEE_DISTRIBUTOR_FACTOR,
      encodeData(["bytes32"], [feeDistributorConfig.glpKey]),
      expandDecimals(80, 28)
    );
    await configD.setUint(
      keys.MIN_FEE_DISTRIBUTOR_FACTOR,
      encodeData(["bytes32"], [feeDistributorConfig.treasuryKey]),
      expandDecimals(70, 28)
    );
    await dataStoreD.setAddressArray(keys.FEE_DISTRIBUTOR_KEEPER_COSTS, [
      signer2.address,
      signer3.address,
      signer4.address,
    ]);
    await dataStoreD.setUintArray(keys.FEE_DISTRIBUTOR_KEEPER_COSTS, [
      expandDecimals(3, 15),
      expandDecimals(5, 15),
      expandDecimals(4, 15),
    ]);
    await dataStoreD.setBoolArray(keys.FEE_DISTRIBUTOR_KEEPER_COSTS, [true, false, true]);
    await configD.setUint(keys.FEE_DISTRIBUTOR_KEEPER_GLP_FACTOR, "0x", expandDecimals(50, 28));
    await configD.setUint(keys.FEE_DISTRIBUTOR_CHAINLINK_FACTOR, "0x", expandDecimals(12, 28));
    await configD.setUint(
      keys.BUYBACK_BATCH_AMOUNT,
      encodeData(["address"], [mockOftD.address]),
      expandDecimals(5, 17)
    );

    await configD.setUint(keys.BUYBACK_BATCH_AMOUNT, encodeData(["address"], [wnt.address]), expandDecimals(5, 17));
    await dataStoreD.setAddress(keys.oracleProviderForTokenKey(wnt.address), chainlinkPriceFeedProvider.address);
    await dataStoreD.setAddress(keys.oracleProviderForTokenKey(gmx.address), chainlinkPriceFeedProvider.address);
    await dataStoreD.setUint(keys.tokenTransferGasLimit(mockOftD.address), 200_000);
    await signer2.sendTransaction({
      to: wallet.address,
      value: expandDecimals(10_000, 18).sub(expandDecimals(1, 15)),
    });
    await signer3.sendTransaction({
      to: wallet.address,
      value: expandDecimals(10_000, 18).sub(expandDecimals(2, 15)),
    });
    await signer4.sendTransaction({
      to: wallet.address,
      value: expandDecimals(10_000, 18).sub(expandDecimals(5, 15)),
    });

    await wnt.mint(feeDistributorVaultD.address, expandDecimals(1_000, 18));

    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);
    expect(distributionState).to.eq(0);

    distributionState = await dataStoreD.getUint(keys.FEE_DISTRIBUTOR_STATE);
    expect(distributionState).to.eq(0);

    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    await mockLzReadResponseChainA.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockExtendedGmxTracker.setTotalSupply(expandDecimals(6_000_000, 18));
    await mockLzReadResponseChainC.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockExtendedGmxTrackerD.setTotalSupply(expandDecimals(6_000_000, 18));

    await mockLzReadResponseChainA.setUint(
      keys.withdrawableBuybackTokenAmountKey(mockOftA.address),
      expandDecimals(10_000, 18)
    );
    await mockLzReadResponseChainC.setUint(
      keys.withdrawableBuybackTokenAmountKey(mockOftC.address),
      expandDecimals(20_000, 18)
    );
    await dataStore.setUint(keys.withdrawableBuybackTokenAmountKey(gmx.address), expandDecimals(40_000, 18));
    await gmx.mint(feeHandler.address, expandDecimals(40_000, 18));
    await dataStoreD.setUint(keys.withdrawableBuybackTokenAmountKey(mockOftD.address), expandDecimals(50_000, 18));

    await gmx.mint(wallet.address, expandDecimals(290_000, 18));
    await gmx.approve(mockOftAdapterB.address, expandDecimals(170_000, 18));
    let sendParam = {
      dstEid: eidA,
      to: addressToBytes32(user0.address),
      amountLD: expandDecimals(30_000, 18),
      minAmountLD: expandDecimals(30_000, 18),
      extraOptions: ethers.utils.arrayify("0x"),
      composeMsg: ethers.utils.arrayify("0x"),
      oftCmd: ethers.utils.arrayify("0x"),
    };
    let feeQuote = await mockOftAdapterB.quoteSend(sendParam, false);
    let nativeFee = feeQuote.nativeFee;
    await mockOftAdapterB.send(sendParam, { nativeFee: nativeFee, lzTokenFee: 0 }, wallet.address, {
      value: nativeFee,
    });

    await gmx.transfer(feeDistributorVault.address, expandDecimals(120_000, 18));

    sendParam = {
      dstEid: eidC,
      to: addressToBytes32(user1.address),
      amountLD: expandDecimals(10_000, 18),
      minAmountLD: expandDecimals(10_000, 18),
      extraOptions: ethers.utils.arrayify("0x"),
      composeMsg: ethers.utils.arrayify("0x"),
      oftCmd: ethers.utils.arrayify("0x"),
    };
    feeQuote = await mockOftAdapterB.quoteSend(sendParam, false);
    nativeFee = feeQuote.nativeFee;
    await mockOftAdapterB.send(sendParam, { nativeFee: nativeFee, lzTokenFee: 0 }, wallet.address, {
      value: nativeFee,
    });

    sendParam = {
      dstEid: eidD,
      to: addressToBytes32(feeHandlerD.address),
      amountLD: expandDecimals(50_000, 18),
      minAmountLD: expandDecimals(50_000, 18),
      extraOptions: ethers.utils.arrayify("0x"),
      composeMsg: ethers.utils.arrayify("0x"),
      oftCmd: ethers.utils.arrayify("0x"),
    };
    feeQuote = await mockOftAdapterB.quoteSend(sendParam, false);
    nativeFee = feeQuote.nativeFee;
    await mockOftAdapterB.send(sendParam, { nativeFee: nativeFee, lzTokenFee: 0 }, wallet.address, {
      value: nativeFee,
    });

    sendParam = {
      dstEid: eidD,
      to: addressToBytes32(feeDistributorVaultD.address),
      amountLD: expandDecimals(80_000, 18),
      minAmountLD: expandDecimals(80_000, 18),
      extraOptions: ethers.utils.arrayify("0x"),
      composeMsg: ethers.utils.arrayify("0x"),
      oftCmd: ethers.utils.arrayify("0x"),
    };
    feeQuote = await mockOftAdapterB.quoteSend(sendParam, false);
    nativeFee = feeQuote.nativeFee;
    await mockOftAdapterB.send(sendParam, { nativeFee: nativeFee, lzTokenFee: 0 }, wallet.address, {
      value: nativeFee,
    });

    await wallet.sendTransaction({
      to: feeDistributor.address,
      value: expandDecimals(1, 18),
    });

    await wallet.sendTransaction({
      to: mockFeeDistributor.address,
      value: expandDecimals(1, 18),
    });

    let wntPrice = await wethPriceFeed.latestAnswer();
    expect(wntPrice).to.eq(expandDecimals(5_000, 8));

    let gmxPrice = await gmxPriceFeed.latestAnswer();
    expect(gmxPrice).to.eq(expandDecimals(20, 8));

    const feeReceiverAmountBeforeBridgingA = await mockOftA.balanceOf(user0.address);
    const feeReceiverAmountBeforeBridgingB = await gmx.balanceOf(feeDistributorVault.address);
    const feeReceiverAmountBeforeBridgingC = await mockOftC.balanceOf(user1.address);
    const feeReceiverAmountBeforeBridgingD = await mockOftD.balanceOf(feeDistributorVaultD.address);

    const tx = await feeDistributor.initiateDistribute();
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt.blockNumber);
    const timestamp = block.timestamp;

    const txD = await mockFeeDistributor.initiateDistribute();
    const receiptD = await txD.wait();
    const blockD = await ethers.provider.getBlock(receiptD.blockNumber);
    const timestampD = blockD.timestamp;

    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);
    const distributionStateD = await dataStoreD.getUint(keys.FEE_DISTRIBUTOR_STATE);

    const distributeTimestamp = await dataStore.getUint(keys.FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP);
    const distributeTimestampD = await dataStoreD.getUint(keys.FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP);

    const feeDistributionInitiatedEventData = parseLogs(fixture, receipt)[21].parsedEventData;
    const feeDistributionDataReceived = parseLogs(fixture, receipt)[18].parsedEventData;
    const feeDistributionGmxBridgedOut = parseLogs(fixture, receipt)[17].parsedEventData;

    const feeDistributionInitiatedEventDataD = parseLogs(fixture, receiptD)[12].parsedEventData;
    const feeDistributionDataReceivedD = parseLogs(fixture, receiptD)[9].parsedEventData;
    const feeDistributionGmxBridgedOutD = parseLogs(fixture, receiptD)[8].parsedEventData;

    const feeAmountGmxA = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdA));
    const feeAmountGmxB = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdB));
    const feeAmountGmxC = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdC));
    const feeAmountGmxD = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdD));
    const totalFeeAmountGmx = await dataStore.getUint(keys.FEE_DISTRIBUTOR_TOTAL_FEE_AMOUNT_GMX);

    const stakedGmxA = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainIdA));
    const stakedGmxB = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainIdB));
    const stakedGmxC = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainIdC));
    const stakedGmxD = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainIdD));
    const totalStakedGmx = await dataStore.getUint(keys.FEE_DISTRIBUTOR_TOTAL_STAKED_GMX);

    wntPrice = await dataStore.getUint(keys.FEE_DISTRIBUTOR_WNT_PRICE);
    gmxPrice = await dataStore.getUint(keys.FEE_DISTRIBUTOR_GMX_PRICE);

    const feeReceiverAmountAfterBridgingA = await mockOftA.balanceOf(user0.address);
    const feeReceiverAmountAfterBridgingB = await gmx.balanceOf(feeDistributorVault.address);
    const feeReceiverAmountAfterBridgingC = await mockOftC.balanceOf(user1.address);
    const feeReceiverAmountAfterBridgingD = await mockOftD.balanceOf(feeDistributorVaultD.address);

    expect(distributionState).to.eq(3);
    expect(distributionStateD).to.eq(3);

    expect(distributeTimestamp).to.equal(timestamp);
    expect(distributeTimestampD).to.equal(timestampD);

    expect(feeDistributionInitiatedEventData.numberOfChainsReadRequests).to.equal(3);
    expect(feeDistributionDataReceived.isBridgingCompleted).is.true;
    expect(feeDistributionGmxBridgedOut.totalGmxBridgedOut).to.equal(expandDecimals(40_000, 18));
    expect(feeDistributionInitiatedEventDataD.numberOfChainsReadRequests).to.equal(3);
    expect(feeDistributionDataReceivedD.isBridgingCompleted).is.true;
    expect(feeDistributionGmxBridgedOutD.totalGmxBridgedOut).to.equal(expandDecimals(10_000, 18));

    expect(feeAmountGmxA).to.equal(expandDecimals(40_000, 18));
    expect(feeAmountGmxB).to.equal(expandDecimals(120_000, 18));
    expect(feeAmountGmxC).to.equal(expandDecimals(30_000, 18));
    expect(feeAmountGmxD).to.equal(expandDecimals(130_000, 18));
    expect(totalFeeAmountGmx).to.equal(expandDecimals(360_000, 18));

    expect(stakedGmxA).to.equal(expandDecimals(3_000_000, 18));
    expect(stakedGmxB).to.equal(expandDecimals(6_000_000, 18));
    expect(stakedGmxC).to.equal(expandDecimals(3_000_000, 18));
    expect(stakedGmxD).to.equal(expandDecimals(6_000_000, 18));
    expect(totalStakedGmx).to.equal(expandDecimals(18_000_000, 18));

    expect(wntPrice).to.equal(expandDecimals(5_000, 12));
    expect(gmxPrice).to.equal(expandDecimals(20, 12));

    expect(feeReceiverAmountBeforeBridgingA).to.equal(expandDecimals(30_000, 18));
    expect(feeReceiverAmountBeforeBridgingB).to.equal(expandDecimals(120_000, 18));
    expect(feeReceiverAmountBeforeBridgingC).to.equal(expandDecimals(10_000, 18));
    expect(feeReceiverAmountBeforeBridgingD).to.equal(expandDecimals(80_000, 18));

    expect(feeReceiverAmountAfterBridgingA).to.equal(expandDecimals(50_000, 18));
    expect(feeReceiverAmountAfterBridgingB).to.equal(expandDecimals(120_000, 18));
    expect(feeReceiverAmountAfterBridgingC).to.equal(expandDecimals(40_000, 18));
    expect(feeReceiverAmountAfterBridgingD).to.equal(expandDecimals(120_000, 18));
  });
});
