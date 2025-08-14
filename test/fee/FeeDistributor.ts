import { Options } from "@layerzerolabs/lz-v2-utilities";
import { addressToBytes32 } from "@layerzerolabs/lz-v2-utilities";

import { expect } from "chai";
import { grantRole } from "../../utils/role";
import { expandDecimals, bigNumberify } from "../../utils/math";
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
    gmxA,
    gmx,
    gmxC,
    esGmx,
    roleStore,
    feeHandler,
    mockExtendedGmxDistributor,
    mockLzReadResponseChainA,
    mockExtendedGmxTracker,
    mockLzReadResponseChainC,
    mockVester,
    mockEndpointV2A,
    mockEndpointV2B,
    mockEndpointV2C,
    mockGmxAdapterA,
    mockGmxAdapterB,
    mockGmxAdapterC,
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
    claimVault,
    claimUtils,
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
    signer8,
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
  const eidD = 4000;

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
      claimVault,
      claimUtils,
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
      signer8,
    } = fixture.accounts);

    mockExtendedGmxDistributor = await deployContract("MockRewardDistributorV1", []);
    mockLzReadResponseChainA = await deployContract("MockLzReadResponse", []);
    mockExtendedGmxTracker = await deployContract("MockRewardTrackerV1", [mockExtendedGmxDistributor.address]);
    mockLzReadResponseChainC = await deployContract("MockLzReadResponse", []);
    mockVester = await deployContract("MockVesterV1", [
      [user7.address, user8.address, wallet.address],
      [expandDecimals(10, 18), expandDecimals(30, 18), expandDecimals(20, 18)],
    ]);
    mockEndpointV2A = await deployContract("MockEndpointV2", [eidA]);
    // use separate mockEndpointV2B endpoint to avoid reentrancy issues when using mockEndpointV2
    mockEndpointV2B = await deployContract("MockEndpointV2", [eidB]);
    mockEndpointV2C = await deployContract("MockEndpointV2", [eidC]);
    gmxA = await deployContract("MintableToken", ["GMX", "GMX", 18]);
    gmxC = await deployContract("MintableToken", ["GMX", "GMX", 18]);
    mockGmxAdapterA = await deployContract("MockGMX_Adapter", [
      [
        { dstEid: eidB, limit: expandDecimals(1000000, 18), window: 60 },
        { dstEid: eidC, limit: expandDecimals(1000000, 18), window: 60 },
        { dstEid: eidD, limit: expandDecimals(1000000, 18), window: 60 },
      ],
      gmxA.address,
      gmxA.address,
      mockEndpointV2A.address,
      wallet.address,
    ]);
    mockGmxAdapterB = await deployContract("MockGMX_Adapter", [
      [
        { dstEid: eidA, limit: expandDecimals(1000000, 18), window: 60 },
        { dstEid: eidC, limit: expandDecimals(1000000, 18), window: 60 },
        { dstEid: eidD, limit: expandDecimals(1000000, 18), window: 60 },
      ],
      gmx.address,
      gmx.address,
      mockEndpointV2B.address,
      wallet.address,
    ]);
    mockGmxAdapterC = await deployContract("MockGMX_Adapter", [
      [
        { dstEid: eidA, limit: expandDecimals(1000000, 18), window: 60 },
        { dstEid: eidB, limit: expandDecimals(1000000, 18), window: 60 },
        { dstEid: eidD, limit: expandDecimals(1000000, 18), window: 60 },
      ],
      gmxC.address,
      gmxC.address,
      mockEndpointV2C.address,
      wallet.address,
    ]);

    await grantRole(roleStore, wallet.address, "FEE_DISTRIBUTION_KEEPER");

    options = Options.newOptions().addExecutorLzReceiveOption(300000, 0).toHex().toString();

    // set mock contract values
    await mockEndpointV2.setDestLzEndpoint(multichainReader.address, mockEndpointV2.address);
    await mockEndpointV2.setReadChannelId(channelId);

    await mockEndpointV2A.setDestLzEndpoint(mockGmxAdapterB.address, mockEndpointV2B.address);
    await mockEndpointV2A.setDestLzEndpoint(mockGmxAdapterC.address, mockEndpointV2C.address);

    await mockEndpointV2B.setDestLzEndpoint(mockGmxAdapterA.address, mockEndpointV2A.address);
    await mockEndpointV2B.setDestLzEndpoint(mockGmxAdapterC.address, mockEndpointV2C.address);

    await mockEndpointV2C.setDestLzEndpoint(mockGmxAdapterA.address, mockEndpointV2A.address);
    await mockEndpointV2C.setDestLzEndpoint(mockGmxAdapterB.address, mockEndpointV2B.address);

    await mockGmxAdapterA.setPeer(eidB, ethers.utils.zeroPad(mockGmxAdapterB.address, 32));
    await mockGmxAdapterA.setPeer(eidC, ethers.utils.zeroPad(mockGmxAdapterC.address, 32));
    await mockGmxAdapterA.setEnforcedOptions([{ eid: eidB, msgType: 1, options: options }]);
    await mockGmxAdapterA.setEnforcedOptions([{ eid: eidC, msgType: 1, options: options }]);

    await mockGmxAdapterB.setPeer(eidA, ethers.utils.zeroPad(mockGmxAdapterA.address, 32));
    await mockGmxAdapterB.setPeer(eidC, ethers.utils.zeroPad(mockGmxAdapterC.address, 32));
    await mockGmxAdapterB.setEnforcedOptions([{ eid: eidA, msgType: 1, options: options }]);
    await mockGmxAdapterB.setEnforcedOptions([{ eid: eidC, msgType: 1, options: options }]);

    await mockGmxAdapterC.setPeer(eidA, ethers.utils.zeroPad(mockGmxAdapterA.address, 32));
    await mockGmxAdapterC.setPeer(eidB, ethers.utils.zeroPad(mockGmxAdapterB.address, 32));
    await mockGmxAdapterC.setEnforcedOptions([{ eid: eidA, msgType: 1, options: options }]);
    await mockGmxAdapterC.setEnforcedOptions([{ eid: eidB, msgType: 1, options: options }]);

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
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdA, feeDistributorConfig.gmxKey]),
      gmxA.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdB, feeDistributorConfig.gmxKey]),
      gmx.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdC, feeDistributorConfig.gmxKey]),
      gmxC.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdA, feeDistributorConfig.extendedGmxTrackerKey]),
      mockLzReadResponseChainA.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdB, feeDistributorConfig.extendedGmxTrackerKey]),
      mockExtendedGmxTracker.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdC, feeDistributorConfig.extendedGmxTrackerKey]),
      mockLzReadResponseChainC.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdA, feeDistributorConfig.dataStoreKey]),
      mockLzReadResponseChainA.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdC, feeDistributorConfig.dataStoreKey]),
      mockLzReadResponseChainC.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdA, keys.FEE_RECEIVER]),
      user0.address
    );
    await dataStore.setAddress(keys.FEE_RECEIVER, feeDistributorVault.address);
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdC, keys.FEE_RECEIVER]),
      user1.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["bytes32"], [feeDistributorConfig.layerzeroOftKey]),
      mockGmxAdapterB.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["bytes32"], [feeDistributorConfig.chainlinkKey]),
      user5.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["bytes32"], [feeDistributorConfig.treasuryKey]),
      user6.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["bytes32"], [feeDistributorConfig.esGmxVesterKey]),
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
    await config.setUint(keys.FEE_DISTRIBUTOR_MAX_REFERRAL_REWARDS_WNT_USD_FACTOR, "0x", expandDecimals(20, 28));
    await dataStore.setAddressArray(keys.FEE_DISTRIBUTOR_KEEPER_COSTS, [user2.address, user3.address, user4.address]);
    await dataStore.setUintArray(keys.FEE_DISTRIBUTOR_KEEPER_COSTS, [
      expandDecimals(3, 15),
      expandDecimals(5, 15),
      expandDecimals(4, 15),
    ]);
    await dataStore.setBoolArray(keys.FEE_DISTRIBUTOR_KEEPER_COSTS, [true, false, true]);
    await config.setUint(keys.FEE_DISTRIBUTOR_MAX_WNT_AMOUNT_FROM_TREASURY, "0x", expandDecimals(1, 15));
    await config.setUint(keys.FEE_DISTRIBUTOR_CHAINLINK_FACTOR, "0x", expandDecimals(12, 28));
    await config.setUint(keys.BUYBACK_BATCH_AMOUNT, encodeData(["address"], [gmx.address]), expandDecimals(5, 17));
    await config.setUint(keys.BUYBACK_BATCH_AMOUNT, encodeData(["address"], [wnt.address]), expandDecimals(5, 17));
    await dataStore.setAddress(
      keys.oracleProviderForTokenKey(oracle.address, wnt.address),
      chainlinkPriceFeedProvider.address
    );
    await dataStore.setAddress(
      keys.oracleProviderForTokenKey(oracle.address, gmx.address),
      chainlinkPriceFeedProvider.address
    );

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

    await wnt.mint(user6.address, expandDecimals(1, 18));
    await wnt.connect(user6).approve(feeDistributor.address, expandDecimals(1, 18));

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
      keys.withdrawableBuybackTokenAmountKey(gmxA.address),
      expandDecimals(40_000, 18)
    );
    await mockLzReadResponseChainC.setUint(
      keys.withdrawableBuybackTokenAmountKey(gmxC.address),
      expandDecimals(20_000, 18)
    );
    await dataStore.setUint(keys.withdrawableBuybackTokenAmountKey(gmx.address), expandDecimals(10_000, 18));
    await gmx.mint(feeHandler.address, expandDecimals(10_000, 18));

    await gmx.mint(wallet.address, expandDecimals(170_000, 18));
    let sendParam = {
      dstEid: eidA,
      to: addressToBytes32(user0.address),
      amountLD: expandDecimals(120_000, 18),
      minAmountLD: expandDecimals(120_000, 18),
      extraOptions: ethers.utils.arrayify("0x"),
      composeMsg: ethers.utils.arrayify("0x"),
      oftCmd: ethers.utils.arrayify("0x"),
    };
    let feeQuote = await mockGmxAdapterB.quoteSend(sendParam, false);
    let nativeFee = feeQuote.nativeFee;
    await mockGmxAdapterB.send(sendParam, { nativeFee: nativeFee, lzTokenFee: 0 }, wallet.address, {
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
    feeQuote = await mockGmxAdapterB.quoteSend(sendParam, false);
    nativeFee = feeQuote.nativeFee;
    await mockGmxAdapterB.send(sendParam, { nativeFee: nativeFee, lzTokenFee: 0 }, wallet.address, {
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
      keys.withdrawableBuybackTokenAmountKey(gmxA.address),
      expandDecimals(10_000, 18)
    );
    await mockLzReadResponseChainC.setUint(
      keys.withdrawableBuybackTokenAmountKey(gmxC.address),
      expandDecimals(20_000, 18)
    );
    await dataStore.setUint(keys.withdrawableBuybackTokenAmountKey(gmx.address), expandDecimals(40_000, 18));
    await gmx.mint(feeHandler.address, expandDecimals(40_000, 18));

    await gmx.mint(wallet.address, expandDecimals(170_000, 18));
    let sendParam = {
      dstEid: eidA,
      to: addressToBytes32(user0.address),
      amountLD: expandDecimals(40_000, 18),
      minAmountLD: expandDecimals(40_000, 18),
      extraOptions: ethers.utils.arrayify("0x"),
      composeMsg: ethers.utils.arrayify("0x"),
      oftCmd: ethers.utils.arrayify("0x"),
    };
    let feeQuote = await mockGmxAdapterB.quoteSend(sendParam, false);
    let nativeFee = feeQuote.nativeFee;
    await mockGmxAdapterB.send(sendParam, { nativeFee: nativeFee, lzTokenFee: 0 }, wallet.address, {
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
    feeQuote = await mockGmxAdapterB.quoteSend(sendParam, false);
    nativeFee = feeQuote.nativeFee;
    await mockGmxAdapterB.send(sendParam, { nativeFee: nativeFee, lzTokenFee: 0 }, wallet.address, {
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

    const feeReceiverAmountBeforeBridgingA = await gmxA.balanceOf(user0.address);
    const feeReceiverAmountBeforeBridgingB = await gmx.balanceOf(feeDistributorVault.address);
    const feeReceiverAmountBeforeBridgingC = await gmxC.balanceOf(user1.address);

    const tx = await feeDistributor.initiateDistribute();
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt.blockNumber);
    const timestamp = block.timestamp;

    const distributeTimestamp = await dataStore.getUint(keys.FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP);

    const feeDistributionInitiatedEventData = parseLogs(fixture, receipt)[19].parsedEventData;
    const feeDistributionDataReceived = parseLogs(fixture, receipt)[16].parsedEventData;
    const feeDistributionGmxBridgedOut = parseLogs(fixture, receipt)[15].parsedEventData;

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

    const feeReceiverAmountAfterBridgingA = await gmxA.balanceOf(user0.address);
    const feeReceiverAmountAfterBridgingB = await gmx.balanceOf(feeDistributorVault.address);
    const feeReceiverAmountAfterBridgingC = await gmxC.balanceOf(user1.address);

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

  it("distribute() and depositReferralRewards() for fee deficit", async function () {
    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);
    expect(distributionState).to.eq(0);

    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    await mockLzReadResponseChainA.setTotalSupply(expandDecimals(6_000_000, 18));
    await mockExtendedGmxTracker.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockLzReadResponseChainC.setTotalSupply(expandDecimals(3_000_000, 18));

    await mockLzReadResponseChainA.setUint(
      keys.withdrawableBuybackTokenAmountKey(gmxA.address),
      expandDecimals(40_000, 18)
    );
    await mockLzReadResponseChainC.setUint(
      keys.withdrawableBuybackTokenAmountKey(gmxC.address),
      expandDecimals(20_000, 18)
    );
    await dataStore.setUint(keys.withdrawableBuybackTokenAmountKey(gmx.address), expandDecimals(10_000, 18));
    await gmx.mint(feeHandler.address, expandDecimals(10_000, 18));

    await gmx.mint(wallet.address, expandDecimals(170_000, 18));
    let sendParam = {
      dstEid: eidA,
      to: addressToBytes32(user0.address),
      amountLD: expandDecimals(120_000, 18),
      minAmountLD: expandDecimals(120_000, 18),
      extraOptions: ethers.utils.arrayify("0x"),
      composeMsg: ethers.utils.arrayify("0x"),
      oftCmd: ethers.utils.arrayify("0x"),
    };
    let feeQuote = await mockGmxAdapterB.quoteSend(sendParam, false);
    let nativeFee = feeQuote.nativeFee;
    await mockGmxAdapterB.send(sendParam, { nativeFee: nativeFee, lzTokenFee: 0 }, wallet.address, {
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
    feeQuote = await mockGmxAdapterB.quoteSend(sendParam, false);
    nativeFee = feeQuote.nativeFee;
    await mockGmxAdapterB.send(sendParam, { nativeFee: nativeFee, lzTokenFee: 0 }, wallet.address, {
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
    feeQuote = await mockGmxAdapterA.quoteSend(sendParam, false);
    nativeFee = feeQuote.nativeFee;
    await mockGmxAdapterA.connect(user0).send(sendParam, { nativeFee: nativeFee, lzTokenFee: 0 }, user0.address, {
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
    feeQuote = await mockGmxAdapterA.quoteSend(sendParam, false);
    nativeFee = feeQuote.nativeFee;
    await mockGmxAdapterA.connect(user0).send(sendParam, { nativeFee: nativeFee, lzTokenFee: 0 }, user0.address, {
      value: nativeFee,
    });

    const user0Balance = await gmxA.balanceOf(user0.address);
    const feeDistributorVaultBalance = await gmx.balanceOf(feeDistributorVault.address);
    const user1Balance = await gmxC.balanceOf(user1.address);

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
    const distributeEventData = parseLogs(fixture, distributeReceipt)[6].parsedEventData;

    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);

    const keeperCosts = await dataStore.getUintArray(keys.FEE_DISTRIBUTOR_KEEPER_COSTS);

    const keeper1Balance = await ethers.provider.getBalance(user2.address);
    const keeper2Balance = await ethers.provider.getBalance(user3.address);
    const keeper3Balance = await ethers.provider.getBalance(user4.address);

    const sentToKeeper1 = keeperCosts[0].sub(keeper1BalancePreDistribute);
    const sentToKeeper2 = keeperCosts[1].sub(keeper2BalancePreDistribute);
    const keeperCostsV1 = sentToKeeper2;
    const keeperCostsV2 = sentToKeeper1;
    const wntForKeepers = sentToKeeper1.add(sentToKeeper2);
    const totalFees = feesV1Usd.add(feesV2Usd);
    const chainlinkTreasuryWntAmount = totalWntBalance.mul(feesV2Usd).div(totalFees);
    const chainlinkFactor = await dataStore.getUint(keys.FEE_DISTRIBUTOR_CHAINLINK_FACTOR);
    const wntForChainlink = chainlinkTreasuryWntAmount.mul(chainlinkFactor).div(expandDecimals(1, 30));
    let wntForTreasury = chainlinkTreasuryWntAmount.sub(wntForChainlink).sub(keeperCostsV2);
    const wntForReferralRewards = wntReferralRewardsInUsd.div(wntPrice);
    const remainingWnt = totalWntBalance
      .sub(keeperCostsV1)
      .sub(keeperCostsV2)
      .sub(wntForChainlink)
      .sub(wntForTreasury)
      .sub(wntForReferralRewards);
    wntForTreasury = wntForTreasury.add(remainingWnt);

    expect(distributionState).to.eq(0);

    expect(keeper1Balance).to.eq(keeperCosts[0]);
    expect(keeper2Balance).to.eq(keeperCosts[1]);
    expect(keeper3Balance).gte(keeperCosts[2]);

    expect(distributeEventData.feesV1Usd).to.eq(feesV1Usd);
    expect(distributeEventData.feesV2Usd).to.eq(feesV2Usd);
    expect(distributeEventData.wntForKeepers).to.eq(wntForKeepers);
    expect(distributeEventData.wntForChainlink).to.eq(wntForChainlink);
    expect(distributeEventData.wntForTreasury).to.eq(wntForTreasury);
    expect(distributeEventData.wntForReferralRewards).to.eq(wntForReferralRewards);
    expect(distributeEventData.esGmxForReferralRewards).to.eq(esGmxForReferralRewards);

    const distributionId = 1;

    const wntReferralRewardsParams = [
      {
        account: user7.address,
        amount: expandDecimals(8, 16),
      },
      {
        account: user8.address,
        amount: expandDecimals(5, 16),
      },
      {
        account: wallet.address,
        amount: expandDecimals(7, 16),
      },
    ];
    await feeDistributor.depositReferralRewards(wnt.address, distributionId, wntReferralRewardsParams);

    const esGmxReferralRewardsParams = [
      {
        account: user7.address,
        amount: expandDecimals(5, 18),
      },
      {
        account: user8.address,
        amount: expandDecimals(2, 18),
      },
      {
        account: wallet.address,
        amount: expandDecimals(3, 18),
      },
    ];
    await feeDistributor.depositReferralRewards(esGmx.address, distributionId, esGmxReferralRewardsParams);

    const wntReferralRewardsDeposited = wntReferralRewardsParams.reduce(
      (acc, curr) => acc.add(curr.amount),
      bigNumberify(0)
    );
    const esGmxReferralRewardsDeposited = esGmxReferralRewardsParams.reduce(
      (acc, curr) => acc.add(curr.amount),
      bigNumberify(0)
    );
    const claimVaultWntBalance = await wnt.balanceOf(claimVault.address);
    const claimVaultEsGmxBalance = await esGmx.balanceOf(claimVault.address);

    expect(wntReferralRewardsDeposited).to.eq(claimVaultWntBalance);
    expect(esGmxReferralRewardsDeposited).to.eq(claimVaultEsGmxBalance);
  });

  it("distribute() and depositReferralRewards() for fee surplus", async function () {
    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);
    expect(distributionState).to.eq(0);

    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    await mockLzReadResponseChainA.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockExtendedGmxTracker.setTotalSupply(expandDecimals(6_000_000, 18));
    await mockLzReadResponseChainC.setTotalSupply(expandDecimals(3_000_000, 18));

    await mockLzReadResponseChainA.setUint(
      keys.withdrawableBuybackTokenAmountKey(gmxA.address),
      expandDecimals(10_000, 18)
    );
    await mockLzReadResponseChainC.setUint(
      keys.withdrawableBuybackTokenAmountKey(gmxC.address),
      expandDecimals(20_000, 18)
    );
    await dataStore.setUint(keys.withdrawableBuybackTokenAmountKey(gmx.address), expandDecimals(40_000, 18));
    await gmx.mint(feeHandler.address, expandDecimals(40_000, 18));

    await gmx.mint(wallet.address, expandDecimals(170_000, 18));
    let sendParam = {
      dstEid: eidA,
      to: addressToBytes32(user0.address),
      amountLD: expandDecimals(40_000, 18),
      minAmountLD: expandDecimals(40_000, 18),
      extraOptions: ethers.utils.arrayify("0x"),
      composeMsg: ethers.utils.arrayify("0x"),
      oftCmd: ethers.utils.arrayify("0x"),
    };
    let feeQuote = await mockGmxAdapterB.quoteSend(sendParam, false);
    let nativeFee = feeQuote.nativeFee;
    await mockGmxAdapterB.send(sendParam, { nativeFee: nativeFee, lzTokenFee: 0 }, wallet.address, {
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
    feeQuote = await mockGmxAdapterB.quoteSend(sendParam, false);
    nativeFee = feeQuote.nativeFee;
    await mockGmxAdapterB.send(sendParam, { nativeFee: nativeFee, lzTokenFee: 0 }, wallet.address, {
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

    const feeReceiverAmountBeforeBridgingA = await gmxA.balanceOf(user0.address);
    const feeReceiverAmountBeforeBridgingB = await gmx.balanceOf(feeDistributorVault.address);
    const feeReceiverAmountBeforeBridgingC = await gmxC.balanceOf(user1.address);

    const tx = await feeDistributor.initiateDistribute();
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt.blockNumber);
    const timestamp = block.timestamp;

    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);

    const distributeTimestamp = await dataStore.getUint(keys.FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP);

    const feeDistributionInitiatedEventData = parseLogs(fixture, receipt)[19].parsedEventData;
    const feeDistributionDataReceived = parseLogs(fixture, receipt)[16].parsedEventData;
    const feeDistributionGmxBridgedOut = parseLogs(fixture, receipt)[15].parsedEventData;

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

    const feeReceiverAmountAfterBridgingA = await gmxA.balanceOf(user0.address);
    const feeReceiverAmountAfterBridgingB = await gmx.balanceOf(feeDistributorVault.address);
    const feeReceiverAmountAfterBridgingC = await gmxC.balanceOf(user1.address);

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
    const distributeEventData = parseLogs(fixture, distributeReceipt)[6].parsedEventData;

    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);

    const keeperCosts = await dataStore.getUintArray(keys.FEE_DISTRIBUTOR_KEEPER_COSTS);

    const keeper1Balance = await ethers.provider.getBalance(user2.address);
    const keeper2Balance = await ethers.provider.getBalance(user3.address);
    const keeper3Balance = await ethers.provider.getBalance(user4.address);

    const sentToKeeper1 = keeperCosts[0].sub(keeper1BalancePreDistribute);
    const sentToKeeper2 = keeperCosts[1].sub(keeper2BalancePreDistribute);
    const keeperCostsV1 = sentToKeeper2;
    const keeperCostsV2 = sentToKeeper1;
    const wntForKeepers = sentToKeeper1.add(sentToKeeper2);
    const totalFees = feesV1Usd.add(feesV2Usd);
    const chainlinkTreasuryWntAmount = totalWntBalance.mul(feesV2Usd).div(totalFees);
    const chainlinkFactor = await dataStore.getUint(keys.FEE_DISTRIBUTOR_CHAINLINK_FACTOR);
    const wntForChainlink = chainlinkTreasuryWntAmount.mul(chainlinkFactor).div(expandDecimals(1, 30));
    let wntForTreasury = chainlinkTreasuryWntAmount.sub(wntForChainlink).sub(keeperCostsV2);
    const wntForReferralRewards = wntReferralRewardsInUsd.div(wntPrice);
    const remainingWnt = totalWntBalance
      .sub(keeperCostsV1)
      .sub(keeperCostsV2)
      .sub(wntForChainlink)
      .sub(wntForTreasury)
      .sub(wntForReferralRewards);
    wntForTreasury = wntForTreasury.add(remainingWnt);

    expect(distributionState).to.eq(0);

    expect(keeper1Balance).to.eq(keeperCosts[0]);
    expect(keeper2Balance).to.eq(keeperCosts[1]);
    expect(keeper3Balance).gte(keeperCosts[2]);

    expect(distributeEventData.feesV1Usd).to.eq(feesV1Usd);
    expect(distributeEventData.feesV2Usd).to.eq(feesV2Usd);
    expect(distributeEventData.wntForKeepers).to.eq(wntForKeepers);
    expect(distributeEventData.wntForChainlink).to.eq(wntForChainlink);
    expect(distributeEventData.wntForTreasury).to.eq(wntForTreasury);
    expect(distributeEventData.wntForReferralRewards).to.eq(wntForReferralRewards);
    expect(distributeEventData.esGmxForReferralRewards).to.eq(esGmxForReferralRewards);

    const distributionId = 1;

    const wntReferralRewardsParams = [
      {
        account: user7.address,
        amount: expandDecimals(8, 16),
      },
      {
        account: user8.address,
        amount: expandDecimals(5, 16),
      },
      {
        account: wallet.address,
        amount: expandDecimals(7, 16),
      },
    ];
    await feeDistributor.depositReferralRewards(wnt.address, distributionId, wntReferralRewardsParams);

    const esGmxReferralRewardsParams = [
      {
        account: user7.address,
        amount: expandDecimals(5, 18),
      },
      {
        account: user8.address,
        amount: expandDecimals(2, 18),
      },
      {
        account: wallet.address,
        amount: expandDecimals(3, 18),
      },
    ];
    await feeDistributor.depositReferralRewards(esGmx.address, distributionId, esGmxReferralRewardsParams);

    const wntReferralRewardsDeposited = wntReferralRewardsParams.reduce(
      (acc, curr) => acc.add(curr.amount),
      bigNumberify(0)
    );
    const esGmxReferralRewardsDeposited = esGmxReferralRewardsParams.reduce(
      (acc, curr) => acc.add(curr.amount),
      bigNumberify(0)
    );
    const claimVaultWntBalance = await wnt.balanceOf(claimVault.address);
    const claimVaultEsGmxBalance = await esGmx.balanceOf(claimVault.address);

    expect(wntReferralRewardsDeposited).to.eq(claimVaultWntBalance);
    expect(esGmxReferralRewardsDeposited).to.eq(claimVaultEsGmxBalance);
  });

  it("WNT for V1 keeper costs and referral rewards shortfall covered by WNT from treasury", async () => {
    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    await mockLzReadResponseChainA.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockExtendedGmxTracker.setTotalSupply(expandDecimals(6_000_000, 18));
    await mockLzReadResponseChainC.setTotalSupply(expandDecimals(3_000_000, 18));

    await mockLzReadResponseChainA.setUint(
      keys.withdrawableBuybackTokenAmountKey(gmxA.address),
      expandDecimals(10_000, 18)
    );
    await mockLzReadResponseChainC.setUint(
      keys.withdrawableBuybackTokenAmountKey(gmxC.address),
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

    await dataStore.setUintArray(keys.FEE_DISTRIBUTOR_KEEPER_COSTS, [
      expandDecimals(3, 15),
      expandDecimals(9, 16),
      expandDecimals(4, 15),
    ]);

    await feeDistributor.initiateDistribute();

    const feesV1Usd = expandDecimals(10_000, 30);
    const feesV2Usd = expandDecimals(40_000, 30);

    const keeperCosts = await dataStore.getUintArray(keys.FEE_DISTRIBUTOR_KEEPER_COSTS);

    const keeper1BalancePreDistribute = await ethers.provider.getBalance(user2.address);
    const keeper2BalancePreDistribute = await ethers.provider.getBalance(user3.address);

    const sentToKeeper1 = keeperCosts[0].sub(keeper1BalancePreDistribute);
    const sentToKeeper2 = keeperCosts[1].sub(keeper2BalancePreDistribute);
    const keeperCostsV1 = sentToKeeper2;
    const keeperCostsV2 = sentToKeeper1;

    const totalWntBalance = await wnt.balanceOf(feeDistributorVault.address);

    const totalFeesUsd = feesV1Usd.add(feesV2Usd);
    const chainlinkTreasuryWnt = totalWntBalance.mul(feesV2Usd).div(totalFeesUsd);

    const chainlinkFactor = await dataStore.getUint(keys.FEE_DISTRIBUTOR_CHAINLINK_FACTOR);
    const wntForChainlink = chainlinkTreasuryWnt.mul(chainlinkFactor).div(expandDecimals(1, 30));
    const wntForTreasuryPre = chainlinkTreasuryWnt.sub(wntForChainlink).sub(keeperCostsV2);
    const wntReferralRewardsInUsd = expandDecimals(35, 30);
    const wntPrice = await dataStore.getUint(keys.FEE_DISTRIBUTOR_WNT_PRICE);
    const wntForReferralRewards = wntReferralRewardsInUsd.div(wntPrice);
    const esGmxForReferralRewards = 0;

    const remainingWntBeforeV1KeeperAndReferralCosts = totalWntBalance
      .sub(keeperCostsV2)
      .sub(wntForChainlink)
      .sub(wntForTreasuryPre);

    const v1KeeperAndReferralCosts = keeperCostsV1.add(wntForReferralRewards);
    const additionalWntFromTreasury = v1KeeperAndReferralCosts
      .sub(remainingWntBeforeV1KeeperAndReferralCosts)
      .sub(wntForTreasuryPre);

    const maxWntFromTreasury = dataStore.getUint(keys.FEE_DISTRIBUTOR_MAX_WNT_AMOUNT_FROM_TREASURY);

    await expect(
      feeDistributor.distribute(wntReferralRewardsInUsd, esGmxForReferralRewards, feesV1Usd, feesV2Usd)
    ).to.be.revertedWithCustomError(
      errorsContract,
      "MaxWntFromTreasuryExceeded",
      maxWntFromTreasury,
      additionalWntFromTreasury
    );

    await config.setUint(keys.FEE_DISTRIBUTOR_MAX_WNT_AMOUNT_FROM_TREASURY, "0x", expandDecimals(1, 16));

    const treasuryBalancePre = await wnt.balanceOf(user6.address);

    const distributeTx = await feeDistributor.distribute(
      wntReferralRewardsInUsd,
      esGmxForReferralRewards,
      feesV1Usd,
      feesV2Usd
    );

    const distributeReceipt = await distributeTx.wait();

    const distributeEventData = parseLogs(fixture, distributeReceipt)[7].parsedEventData;

    const treasuryBalanceAfter = await wnt.balanceOf(user6.address);
    const sentFromTreasury = treasuryBalancePre.sub(treasuryBalanceAfter);

    expect(sentFromTreasury).to.equal(additionalWntFromTreasury);

    const wntForTreasury = 0;
    const wntForKeepers = keeperCostsV2.add(keeperCostsV1);

    const keeper1Balance = await ethers.provider.getBalance(user2.address);
    const keeper2Balance = await ethers.provider.getBalance(user3.address);
    const keeper3Balance = await ethers.provider.getBalance(user4.address);

    expect(distributionState).to.eq(0);

    expect(keeper1Balance).to.eq(keeperCosts[0]);
    expect(keeper2Balance).to.eq(keeperCosts[1]);
    expect(keeper3Balance).gte(keeperCosts[2]);

    expect(distributeEventData.feesV1Usd).to.eq(feesV1Usd);
    expect(distributeEventData.feesV2Usd).to.eq(feesV2Usd);
    expect(distributeEventData.wntForKeepers).to.eq(wntForKeepers);
    expect(distributeEventData.wntForChainlink).to.eq(wntForChainlink);
    expect(distributeEventData.wntForTreasury).to.eq(wntForTreasury);
    expect(distributeEventData.wntForReferralRewards).to.eq(wntForReferralRewards);
    expect(distributeEventData.esGmxForReferralRewards).to.eq(esGmxForReferralRewards);
  });

  it("initiateDistribute() and processLzReceive() with 2 surplus and 2 deficit chains", async () => {
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
    const gmxD = await deployContract("MintableToken", ["GMX", "GMX", 18]);
    const mockGmxAdapterD = await deployContract("MockGMX_Adapter", [
      [
        { dstEid: eidA, limit: expandDecimals(1000000, 18), window: 60 },
        { dstEid: eidB, limit: expandDecimals(1000000, 18), window: 60 },
        { dstEid: eidC, limit: expandDecimals(1000000, 18), window: 60 },
      ],
      gmxD.address,
      gmxD.address,
      mockEndpointV2D.address,
      wallet.address,
    ]);
    const feeHandlerD = await deployContract(
      "FeeHandler",
      [roleStore.address, oracle.address, dataStoreD.address, eventEmitter.address, mockVaultV1.address, gmxD.address],
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

    const mockVars = [dataStore.address, gmx.address];
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
        signer8.address,
        gmxD.address,
        esGmx.address,
        wnt.address,
        mockVars,
      ],
      {
        libraries: {
          "contracts/fee/FeeDistributorUtils.sol:FeeDistributorUtils": feeDistributorUtils.address,
          "contracts/claim/ClaimUtils.sol:ClaimUtils": claimUtils.address,
        },
      }
    );

    const mockExtendedGmxDistributorD = await deployContract("MockRewardDistributorV1", []);
    const mockExtendedGmxTrackerD = await deployContract("MockRewardTrackerV1", [mockExtendedGmxDistributorD.address]);
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

    await mockEndpointV2DMultichain.setDestLzEndpoint(multichainReaderD.address, mockEndpointV2DMultichain.address);
    await mockEndpointV2DMultichain.setReadChannelId(channelId);

    await mockEndpointV2D.setDestLzEndpoint(mockGmxAdapterA.address, mockEndpointV2A.address);
    await mockEndpointV2D.setDestLzEndpoint(mockGmxAdapterB.address, mockEndpointV2B.address);
    await mockEndpointV2D.setDestLzEndpoint(mockGmxAdapterC.address, mockEndpointV2C.address);

    await mockGmxAdapterD.setPeer(eidA, ethers.utils.zeroPad(mockGmxAdapterA.address, 32));
    await mockGmxAdapterD.setPeer(eidB, ethers.utils.zeroPad(mockGmxAdapterB.address, 32));
    await mockGmxAdapterD.setPeer(eidC, ethers.utils.zeroPad(mockGmxAdapterC.address, 32));
    await mockGmxAdapterD.setEnforcedOptions([{ eid: eidA, msgType: 1, options: options }]);
    await mockGmxAdapterD.setEnforcedOptions([{ eid: eidB, msgType: 1, options: options }]);
    await mockGmxAdapterD.setEnforcedOptions([{ eid: eidC, msgType: 1, options: options }]);

    await mockEndpointV2A.setDestLzEndpoint(mockGmxAdapterD.address, mockEndpointV2D.address);
    await mockEndpointV2B.setDestLzEndpoint(mockGmxAdapterD.address, mockEndpointV2D.address);
    await mockEndpointV2C.setDestLzEndpoint(mockGmxAdapterD.address, mockEndpointV2D.address);

    await mockGmxAdapterA.setPeer(eidD, ethers.utils.zeroPad(mockGmxAdapterD.address, 32));
    await mockGmxAdapterA.setEnforcedOptions([{ eid: eidD, msgType: 1, options: options }]);

    await mockGmxAdapterB.setPeer(eidD, ethers.utils.zeroPad(mockGmxAdapterD.address, 32));
    await mockGmxAdapterB.setEnforcedOptions([{ eid: eidD, msgType: 1, options: options }]);

    await mockGmxAdapterC.setPeer(eidD, ethers.utils.zeroPad(mockGmxAdapterD.address, 32));
    await mockGmxAdapterC.setEnforcedOptions([{ eid: eidD, msgType: 1, options: options }]);

    await config.setUint(keys.MULTICHAIN_CONFIRMATIONS, encodeData(["uint256"], [eidD]), numberOfConfirmations);
    await dataStore.setUintArray(keys.FEE_DISTRIBUTOR_CHAIN_ID, chainIds);
    await config.setUint(keys.FEE_DISTRIBUTOR_LAYERZERO_CHAIN_ID, encodeData(["uint256"], [chainIdD]), eidD);
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdD, feeDistributorConfig.gmxKey]),
      gmxD.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdD, feeDistributorConfig.extendedGmxTrackerKey]),
      mockExtendedGmxTrackerD.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdD, feeDistributorConfig.dataStoreKey]),
      dataStoreD.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
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
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdA, feeDistributorConfig.gmxKey]),
      gmxA.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdB, feeDistributorConfig.gmxKey]),
      gmx.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdC, feeDistributorConfig.gmxKey]),
      gmxC.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdD, feeDistributorConfig.gmxKey]),
      gmxD.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdA, feeDistributorConfig.extendedGmxTrackerKey]),
      mockLzReadResponseChainA.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdB, feeDistributorConfig.extendedGmxTrackerKey]),
      mockExtendedGmxTracker.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdC, feeDistributorConfig.extendedGmxTrackerKey]),
      mockLzReadResponseChainC.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdD, feeDistributorConfig.extendedGmxTrackerKey]),
      mockExtendedGmxTrackerD.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdA, feeDistributorConfig.dataStoreKey]),
      mockLzReadResponseChainA.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdB, feeDistributorConfig.dataStoreKey]),
      dataStore.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdC, feeDistributorConfig.dataStoreKey]),
      mockLzReadResponseChainC.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdA, keys.FEE_RECEIVER]),
      user0.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdB, keys.FEE_RECEIVER]),
      feeDistributorVault.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdC, keys.FEE_RECEIVER]),
      user1.address
    );
    await dataStoreD.setAddress(keys.FEE_RECEIVER, feeDistributorVaultD.address);
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["bytes32"], [feeDistributorConfig.layerzeroOftKey]),
      mockGmxAdapterD.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["bytes32"], [feeDistributorConfig.chainlinkKey]),
      signer0.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["bytes32"], [feeDistributorConfig.treasuryKey]),
      signer1.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["bytes32"], [feeDistributorConfig.esGmxVesterKey]),
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
    await configD.setUint(keys.FEE_DISTRIBUTOR_MAX_REFERRAL_REWARDS_WNT_USD_FACTOR, "0x", expandDecimals(20, 28));
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
    await configD.setUint(keys.FEE_DISTRIBUTOR_MAX_WNT_AMOUNT_FROM_TREASURY, "0x", expandDecimals(1, 16));
    await configD.setUint(keys.FEE_DISTRIBUTOR_CHAINLINK_FACTOR, "0x", expandDecimals(12, 28));
    await configD.setUint(keys.BUYBACK_BATCH_AMOUNT, encodeData(["address"], [gmxD.address]), expandDecimals(5, 17));

    await configD.setUint(keys.BUYBACK_BATCH_AMOUNT, encodeData(["address"], [wnt.address]), expandDecimals(5, 17));
    await dataStoreD.setAddress(
      keys.oracleProviderForTokenKey(oracle.address, wnt.address),
      chainlinkPriceFeedProvider.address
    );
    await dataStoreD.setAddress(
      keys.oracleProviderForTokenKey(oracle.address, gmx.address),
      chainlinkPriceFeedProvider.address
    );
    await dataStoreD.setUint(keys.tokenTransferGasLimit(gmxD.address), 200_000);
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
      keys.withdrawableBuybackTokenAmountKey(gmxA.address),
      expandDecimals(10_000, 18)
    );
    await mockLzReadResponseChainC.setUint(
      keys.withdrawableBuybackTokenAmountKey(gmxC.address),
      expandDecimals(20_000, 18)
    );
    await dataStore.setUint(keys.withdrawableBuybackTokenAmountKey(gmx.address), expandDecimals(40_000, 18));
    await gmx.mint(feeHandler.address, expandDecimals(40_000, 18));
    await dataStoreD.setUint(keys.withdrawableBuybackTokenAmountKey(gmxD.address), expandDecimals(50_000, 18));

    await gmx.mint(wallet.address, expandDecimals(290_000, 18));
    let sendParam = {
      dstEid: eidA,
      to: addressToBytes32(user0.address),
      amountLD: expandDecimals(30_000, 18),
      minAmountLD: expandDecimals(30_000, 18),
      extraOptions: ethers.utils.arrayify("0x"),
      composeMsg: ethers.utils.arrayify("0x"),
      oftCmd: ethers.utils.arrayify("0x"),
    };
    let feeQuote = await mockGmxAdapterB.quoteSend(sendParam, false);
    let nativeFee = feeQuote.nativeFee;
    await mockGmxAdapterB.send(sendParam, { nativeFee: nativeFee, lzTokenFee: 0 }, wallet.address, {
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
    feeQuote = await mockGmxAdapterB.quoteSend(sendParam, false);
    nativeFee = feeQuote.nativeFee;
    await mockGmxAdapterB.send(sendParam, { nativeFee: nativeFee, lzTokenFee: 0 }, wallet.address, {
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
    feeQuote = await mockGmxAdapterB.quoteSend(sendParam, false);
    nativeFee = feeQuote.nativeFee;
    await mockGmxAdapterB.send(sendParam, { nativeFee: nativeFee, lzTokenFee: 0 }, wallet.address, {
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
    feeQuote = await mockGmxAdapterB.quoteSend(sendParam, false);
    nativeFee = feeQuote.nativeFee;
    await mockGmxAdapterB.send(sendParam, { nativeFee: nativeFee, lzTokenFee: 0 }, wallet.address, {
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

    const feeReceiverAmountBeforeBridgingA = await gmxA.balanceOf(user0.address);
    const feeReceiverAmountBeforeBridgingB = await gmx.balanceOf(feeDistributorVault.address);
    const feeReceiverAmountBeforeBridgingC = await gmxC.balanceOf(user1.address);
    const feeReceiverAmountBeforeBridgingD = await gmxD.balanceOf(feeDistributorVaultD.address);

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

    const feeDistributionInitiatedEventData = parseLogs(fixture, receipt)[19].parsedEventData;
    const feeDistributionDataReceived = parseLogs(fixture, receipt)[16].parsedEventData;
    const feeDistributionGmxBridgedOut = parseLogs(fixture, receipt)[15].parsedEventData;

    const feeDistributionInitiatedEventDataD = parseLogs(fixture, receiptD)[13].parsedEventData;
    const feeDistributionDataReceivedD = parseLogs(fixture, receiptD)[10].parsedEventData;
    const feeDistributionGmxBridgedOutD = parseLogs(fixture, receiptD)[9].parsedEventData;

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

    const feeReceiverAmountAfterBridgingA = await gmxA.balanceOf(user0.address);
    const feeReceiverAmountAfterBridgingB = await gmx.balanceOf(feeDistributorVault.address);
    const feeReceiverAmountAfterBridgingC = await gmxC.balanceOf(user1.address);
    const feeReceiverAmountAfterBridgingD = await gmxD.balanceOf(feeDistributorVaultD.address);

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
