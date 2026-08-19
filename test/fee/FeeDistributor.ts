import { Options } from "@layerzerolabs/lz-v2-utilities";
import { addressToBytes32 } from "@layerzerolabs/lz-v2-utilities";

import { expect } from "chai";
import { grantRole } from "../../utils/role";
import { FLOAT_PRECISION, expandDecimals, percentageToFloat } from "../../utils/math";
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
    usdc,
    gmxA,
    gmx,
    gmxC,
    roleStore,
    feeHandler,
    feeVault,
    chainlinkPriceFeedProvider,
    mockRewardDistributor,
    mockLzReadResponseChainA,
    mockRewardTracker,
    mockLzReadResponseChainC,
    mockEndpointV2A,
    mockEndpointV2B,
    mockEndpointV2C,
    mockGmxAdapterA,
    mockGmxAdapterB,
    mockGmxAdapterC,
    initialTimestamp,
    oracle,
    staticOracleProvider,
    eventEmitter,
    configUtils,
    configKeys,
    marketUtils,
    marketStoreUtils,
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
    distributionState,
    chainIds,
    options;

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
      usdc,
      gmx,
      roleStore,
      feeHandler,
      feeVault,
      chainlinkPriceFeedProvider,
      oracle,
      staticOracleProvider,
      eventEmitter,
      configUtils,
      configKeys,
      marketUtils,
      marketStoreUtils,
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
    } = fixture.accounts);

    mockRewardDistributor = await deployContract("MockRewardDistributorV1", [gmx.address]);
    mockLzReadResponseChainA = await deployContract("MockLzReadResponse", []);
    mockRewardTracker = await deployContract("MockRewardTrackerV1", [mockRewardDistributor.address]);
    await mockRewardDistributor.setRewardTracker(mockRewardTracker.address);
    mockLzReadResponseChainC = await deployContract("MockLzReadResponse", []);
    mockEndpointV2A = await deployContract("MockEndpointV2", [eidA]);
    // use separate mockEndpointV2B endpoint to avoid reentrancy issues when using mockEndpointV2
    mockEndpointV2B = await deployContract("MockEndpointV2", [eidB]);
    mockEndpointV2C = await deployContract("MockEndpointV2", [eidC]);
    gmxA = await deployContract("MintableToken", ["GMX", "GMX", 18]);
    gmxC = await deployContract("MintableToken", ["GMX", "GMX", 18]);
    mockGmxAdapterA = await deployContract("MockGMX_MintBurnAdapter", [
      [
        { dstEid: eidB, limit: expandDecimals(1000000, 18), window: 60 },
        { dstEid: eidC, limit: expandDecimals(1000000, 18), window: 60 },
        { dstEid: eidD, limit: expandDecimals(1000000, 18), window: 60 },
      ],
      gmxA.address,
      mockEndpointV2A.address,
      wallet.address,
    ]);
    mockGmxAdapterB = await deployContract("MockGMX_LockboxAdapter", [
      [
        { dstEid: eidA, limit: expandDecimals(1000000, 18), window: 60 },
        { dstEid: eidC, limit: expandDecimals(1000000, 18), window: 60 },
        { dstEid: eidD, limit: expandDecimals(1000000, 18), window: 60 },
      ],
      gmx.address,
      mockEndpointV2B.address,
      wallet.address,
    ]);
    mockGmxAdapterC = await deployContract("MockGMX_MintBurnAdapter", [
      [
        { dstEid: eidA, limit: expandDecimals(1000000, 18), window: 60 },
        { dstEid: eidB, limit: expandDecimals(1000000, 18), window: 60 },
        { dstEid: eidD, limit: expandDecimals(1000000, 18), window: 60 },
      ],
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
    await config.setBool(keys.FEE_DISTRIBUTOR_DISTRIBUTE_FEES, "0x", true);
    await config.setUint(keys.FEE_DISTRIBUTOR_DISTRIBUTION_DAY, "0x", distributionDay);
    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);
    const block = await hre.ethers.provider.getBlock("latest");
    initialTimestamp = block.timestamp;
    await dataStore.setUint(keys.FEE_DISTRIBUTOR_DISTRIBUTION_TIMESTAMP, initialTimestamp);

    await config.setUint(keys.FEE_DISTRIBUTOR_MAX_READ_RESPONSE_DELAY, "0x", 259200);
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
      encodeData(["uint256", "bytes32"], [chainIdA, feeDistributorConfig.rewardTrackerKey]),
      mockLzReadResponseChainA.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdB, feeDistributorConfig.rewardTrackerKey]),
      mockRewardTracker.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdC, feeDistributorConfig.rewardTrackerKey]),
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
      encodeData(["uint256", "bytes32"], [chainIdA, feeDistributorConfig.feeWithdrawerKey]),
      mockLzReadResponseChainA.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdC, feeDistributorConfig.feeWithdrawerKey]),
      mockLzReadResponseChainC.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdA, feeDistributorConfig.feeDistributorVaultKey]),
      user0.address
    );
    await dataStore.setAddress(keys.FEE_RECEIVER, feeDistributorVault.address);
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdC, feeDistributorConfig.feeDistributorVaultKey]),
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
    await dataStore.setAddressArray(keys.FEE_DISTRIBUTOR_KEEPER_COSTS, [user2.address, user3.address, user4.address]);
    await dataStore.setUintArray(keys.FEE_DISTRIBUTOR_KEEPER_COSTS, [
      expandDecimals(3, 15),
      expandDecimals(5, 15),
      expandDecimals(4, 15),
    ]);
    await config.setUint(keys.FEE_DISTRIBUTOR_MAX_FEE_AMOUNT_FROM_TREASURY, "0x", expandDecimals(1, 15));
    await config.setUint(keys.FEE_DISTRIBUTOR_CHAINLINK_FACTOR, "0x", expandDecimals(12, 28));
    await config.setUint(keys.BUYBACK_BATCH_AMOUNT, encodeData(["address"], [gmx.address]), expandDecimals(5, 17));
    await config.setUint(keys.BUYBACK_BATCH_AMOUNT, encodeData(["address"], [wnt.address]), expandDecimals(5, 17));

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

    await wnt.mint(feeVault.address, expandDecimals(1_000, 18));
    await dataStore.setUint(keys.withdrawableBuybackTokenAmountKey(wnt.address), expandDecimals(1_000, 18));

    await wnt.mint(user6.address, expandDecimals(1, 18));
    await wnt.connect(user6).approve(feeDistributor.address, expandDecimals(1, 18));
  });

  // commits the local snapshot and the equivalent snapshot tuples for the simulated remote
  // chains, using the locally committed epoch so the tuples match even near a week boundary
  async function commitSnapshots() {
    await feeDistributor.commitSnapshot();
    const epochId = (await dataStore.getUint(keys.feeDistributorSnapshotEpochKey(chainIdB))).toNumber();
    await feeDistributorConfig.commitRemoteSnapshot({
      mock: mockLzReadResponseChainA,
      gmxToken: gmxA,
      vaultAddress: user0.address,
      chainId: chainIdA,
      distributionDay,
      epochId,
    });
    await feeDistributorConfig.commitRemoteSnapshot({
      mock: mockLzReadResponseChainC,
      gmxToken: gmxC,
      vaultAddress: user1.address,
      chainId: chainIdC,
      distributionDay,
      epochId,
    });
  }

  it("initiateDistribute() can only be executed by FEE_DISTRIBUTION_KEEPER", async function () {
    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);
    expect(distributionState).to.eq(0);

    await expect(feeDistributor.connect(user0).initiateDistribute()).to.be.revertedWithCustomError(
      errorsContract,
      "Unauthorized",
      // @ts-expect-error: types don't reflect 3rd argument support
      "FEE_DISTRIBUTION_KEEPER"
    );
  });

  it("commitSnapshot() can only be executed by FEE_DISTRIBUTION_KEEPER", async function () {
    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);
    expect(distributionState).to.eq(0);

    await expect(feeDistributor.connect(user0).commitSnapshot()).to.be.revertedWithCustomError(
      errorsContract,
      "Unauthorized",
      // @ts-expect-error: types don't reflect 3rd argument support
      "FEE_DISTRIBUTION_KEEPER"
    );
  });

  it("commitSnapshot() cannot be executed if current week distribution is already completed", async function () {
    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);
    expect(distributionState).to.eq(0);

    await expect(feeDistributor.commitSnapshot()).to.be.revertedWithCustomError(
      errorsContract,
      "FeeDistributionAlreadyCompleted",
      // @ts-expect-error: types don't reflect 3rd and 4th argument support
      initialTimestamp,
      initialTimestamp - 60
    );
  });

  it("initiateDistribute() reverts with InvalidWithdrawTarget when feeWithdrawer.withdrawTarget() != feeDistributorVault", async function () {
    const feeWithdrawer = await deployContract("MockFeeWithdrawer", [feeDistributorVault.address]);

    feeDistributor = await deployContract(
      "FeeDistributor",
      [
        roleStore.address,
        feeDistributorVault.address,
        feeWithdrawer.address,
        dataStore.address,
        eventEmitter.address,
        multichainReader.address,
        gmx.address,
        wnt.address,
      ],
      {
        libraries: {
          "contracts/fee/FeeDistributorUtils.sol:FeeDistributorUtils": feeDistributorUtils.address,
        },
      }
    );

    await feeWithdrawer.setWithdrawTarget(user0.address);

    await expect(feeDistributor.initiateDistribute()).to.be.revertedWithCustomError(
      errorsContract,
      "InvalidWithdrawTarget",
      // @ts-expect-error: types don't reflect 3rd and 4th argument support
      user0.address,
      feeDistributorVault.address
    );
  });

  it("initiateDistribute() cannot be executed without a committed snapshot", async function () {
    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);
    expect(distributionState).to.eq(0);

    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    await expect(feeDistributor.initiateDistribute()).to.be.revertedWithCustomError(
      errorsContract,
      "InvalidDistributionState",
      // @ts-expect-error: types don't reflect 3rd argument support
      0
    );
  });

  it("initiateDistribute() and processLzReceive() for fee deficit", async function () {
    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);
    expect(distributionState).to.eq(0);

    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    await mockLzReadResponseChainA.setTotalSupply(expandDecimals(6_000_000, 18));
    await mockRewardTracker.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockLzReadResponseChainC.setTotalSupply(expandDecimals(3_000_000, 18));

    await mockLzReadResponseChainA.setWithdrawableAmount(gmxA.address, expandDecimals(40_000, 18));
    await mockLzReadResponseChainC.setWithdrawableAmount(gmxC.address, expandDecimals(20_000, 18));
    await dataStore.setUint(keys.withdrawableBuybackTokenAmountKey(gmx.address), expandDecimals(10_000, 18));
    await gmx.mint(feeVault.address, expandDecimals(10_000, 18));

    await gmx.mint(wallet.address, expandDecimals(170_000, 18));
    await gmx.approve(mockGmxAdapterB.address, expandDecimals(130_000, 18));
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

    await commitSnapshots();
    const tx = await feeDistributor.initiateDistribute();
    const receipt = await tx.wait();
    const block = await hre.ethers.provider.getBlock(receipt.blockNumber);
    const timestamp = block.timestamp;

    const readResponseTimestamp = await dataStore.getUint(keys.FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP);

    const feeDistributionInitiatedEventData = parseLogs(fixture, receipt)[4].parsedEventData;
    const feeDistributionDataReceivedEventData = parseLogs(fixture, receipt)[1].parsedEventData;

    const feeAmountGmxA = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdA));
    const feeAmountGmxB = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdB));
    const feeAmountGmxC = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdC));
    const totalFeeAmountGmx = await dataStore.getUint(keys.FEE_DISTRIBUTOR_TOTAL_FEE_AMOUNT_GMX);

    const stakedGmxA = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainIdA));
    const stakedGmxB = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainIdB));
    const stakedGmxC = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainIdC));
    const totalStakedGmx = await dataStore.getUint(keys.FEE_DISTRIBUTOR_TOTAL_STAKED_GMX);

    expect(readResponseTimestamp).to.equal(timestamp);

    expect(feeDistributionInitiatedEventData.numberOfChainsReadRequests).to.equal(2);
    expect(feeDistributionDataReceivedEventData.feeAmountGmxCurrentChain).to.equal(feeAmountGmxB);
    expect(feeDistributionDataReceivedEventData.totalGmxBridgedOut).to.equal(0);

    expect(feeAmountGmxA).to.equal(expandDecimals(160_000, 18));
    expect(feeAmountGmxB).to.equal(expandDecimals(50_000, 18));
    expect(feeAmountGmxC).to.equal(expandDecimals(30_000, 18));
    expect(totalFeeAmountGmx).to.equal(expandDecimals(240_000, 18));

    expect(stakedGmxA).to.equal(expandDecimals(6_000_000, 18));
    expect(stakedGmxB).to.equal(expandDecimals(3_000_000, 18));
    expect(stakedGmxC).to.equal(expandDecimals(3_000_000, 18));
    expect(totalStakedGmx).to.equal(expandDecimals(12_000_000, 18));
  });

  it("initiateDistribute() and processLzReceive() for fee surplus", async function () {
    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);
    expect(distributionState).to.eq(0);

    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    await mockLzReadResponseChainA.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockRewardTracker.setTotalSupply(expandDecimals(6_000_000, 18));
    await mockLzReadResponseChainC.setTotalSupply(expandDecimals(3_000_000, 18));

    await mockLzReadResponseChainA.setWithdrawableAmount(gmxA.address, expandDecimals(10_000, 18));
    await mockLzReadResponseChainC.setWithdrawableAmount(gmxC.address, expandDecimals(20_000, 18));
    await dataStore.setUint(keys.withdrawableBuybackTokenAmountKey(gmx.address), expandDecimals(40_000, 18));
    await gmx.mint(feeVault.address, expandDecimals(40_000, 18));

    await gmx.mint(wallet.address, expandDecimals(170_000, 18));
    await gmx.approve(mockGmxAdapterB.address, expandDecimals(50_000, 18));
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

    const feeReceiverAmountBeforeBridgingA = await gmxA.balanceOf(user0.address);
    const feeReceiverAmountBeforeBridgingB = await gmx.balanceOf(feeDistributorVault.address);
    const feeReceiverAmountBeforeBridgingC = await gmxC.balanceOf(user1.address);

    await commitSnapshots();
    const tx = await feeDistributor.initiateDistribute();
    const receipt = await tx.wait();
    const block = await hre.ethers.provider.getBlock(receipt.blockNumber);
    const timestamp = block.timestamp;

    const readResponseTimestamp = await dataStore.getUint(keys.FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP);

    const feeDistributionInitiatedEventData = parseLogs(fixture, receipt)[18].parsedEventData;
    const feeDistributionDataReceivedEventData = parseLogs(fixture, receipt)[15].parsedEventData;

    const feeAmountGmxA = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdA));
    const feeAmountGmxB = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdB));
    const feeAmountGmxC = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdC));
    const totalFeeAmountGmx = await dataStore.getUint(keys.FEE_DISTRIBUTOR_TOTAL_FEE_AMOUNT_GMX);

    const stakedGmxA = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainIdA));
    const stakedGmxB = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainIdB));
    const stakedGmxC = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainIdC));
    const totalStakedGmx = await dataStore.getUint(keys.FEE_DISTRIBUTOR_TOTAL_STAKED_GMX);

    const feeReceiverAmountAfterBridgingA = await gmxA.balanceOf(user0.address);
    const feeReceiverAmountAfterBridgingB = await gmx.balanceOf(feeDistributorVault.address);
    const feeReceiverAmountAfterBridgingC = await gmxC.balanceOf(user1.address);

    expect(readResponseTimestamp).to.equal(timestamp);

    expect(feeDistributionInitiatedEventData.numberOfChainsReadRequests).to.equal(2);
    expect(feeDistributionDataReceivedEventData.totalGmxBridgedOut).to.equal(expandDecimals(40_000, 18));

    expect(feeAmountGmxA).to.equal(expandDecimals(50_000, 18));
    expect(feeAmountGmxB).to.equal(expandDecimals(120_000, 18));
    expect(feeAmountGmxC).to.equal(expandDecimals(30_000, 18));
    expect(totalFeeAmountGmx).to.equal(expandDecimals(240_000, 18));

    expect(stakedGmxA).to.equal(expandDecimals(3_000_000, 18));
    expect(stakedGmxB).to.equal(expandDecimals(6_000_000, 18));
    expect(stakedGmxC).to.equal(expandDecimals(3_000_000, 18));
    expect(totalStakedGmx).to.equal(expandDecimals(12_000_000, 18));

    expect(feeReceiverAmountBeforeBridgingA).to.equal(expandDecimals(40_000, 18));
    expect(feeReceiverAmountBeforeBridgingB).to.equal(expandDecimals(120_000, 18));
    expect(feeReceiverAmountBeforeBridgingC).to.equal(expandDecimals(10_000, 18));

    expect(feeReceiverAmountAfterBridgingA).to.equal(expandDecimals(50_000, 18));
    expect(feeReceiverAmountAfterBridgingB).to.equal(expandDecimals(120_000, 18));
    expect(feeReceiverAmountAfterBridgingC).to.equal(expandDecimals(40_000, 18));
  });

  it("distribute() for fee deficit", async function () {
    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);
    expect(distributionState).to.eq(0);

    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    await mockLzReadResponseChainA.setTotalSupply(expandDecimals(6_000_000, 18));
    await mockRewardTracker.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockLzReadResponseChainC.setTotalSupply(expandDecimals(3_000_000, 18));

    await mockLzReadResponseChainA.setWithdrawableAmount(gmxA.address, expandDecimals(40_000, 18));
    await mockLzReadResponseChainC.setWithdrawableAmount(gmxC.address, expandDecimals(20_000, 18));
    await dataStore.setUint(keys.withdrawableBuybackTokenAmountKey(gmx.address), expandDecimals(10_000, 18));
    await gmx.mint(feeVault.address, expandDecimals(10_000, 18));

    await gmx.mint(wallet.address, expandDecimals(170_000, 18));
    await gmx.approve(mockGmxAdapterB.address, expandDecimals(130_000, 18));
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

    await commitSnapshots();
    const tx = await feeDistributor.initiateDistribute();
    const receipt = await tx.wait();
    const block = await hre.ethers.provider.getBlock(receipt.blockNumber);
    const timestamp = block.timestamp;

    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);

    const readResponseTimestamp = await dataStore.getUint(keys.FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP);

    const feeDistributionInitiatedEventData = parseLogs(fixture, receipt)[4].parsedEventData;
    const feeDistributionDataReceivedEventData = parseLogs(fixture, receipt)[1].parsedEventData;

    const feeAmountGmxA = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdA));
    const feeAmountGmxB = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdB));
    const feeAmountGmxC = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdC));
    const totalFeeAmountGmx = await dataStore.getUint(keys.FEE_DISTRIBUTOR_TOTAL_FEE_AMOUNT_GMX);

    const stakedGmxA = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainIdA));
    const stakedGmxB = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainIdB));
    const stakedGmxC = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainIdC));
    const totalStakedGmx = await dataStore.getUint(keys.FEE_DISTRIBUTOR_TOTAL_STAKED_GMX);

    expect(distributionState).to.eq(2);

    expect(readResponseTimestamp).to.equal(timestamp);

    expect(feeDistributionInitiatedEventData.numberOfChainsReadRequests).to.equal(2);
    expect(feeDistributionDataReceivedEventData.totalGmxBridgedOut).to.equal(0);

    expect(feeAmountGmxA).to.equal(expandDecimals(160_000, 18));
    expect(feeAmountGmxB).to.equal(expandDecimals(50_000, 18));
    expect(feeAmountGmxC).to.equal(expandDecimals(30_000, 18));
    expect(totalFeeAmountGmx).to.equal(expandDecimals(240_000, 18));

    expect(stakedGmxA).to.equal(expandDecimals(6_000_000, 18));
    expect(stakedGmxB).to.equal(expandDecimals(3_000_000, 18));
    expect(stakedGmxC).to.equal(expandDecimals(3_000_000, 18));
    expect(totalStakedGmx).to.equal(expandDecimals(12_000_000, 18));

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

    const keeper1BalancePreDistribute = await hre.ethers.provider.getBalance(user2.address);
    const keeper2BalancePreDistribute = await hre.ethers.provider.getBalance(user3.address);
    const totalWntBalance = await wnt.balanceOf(feeVault.address);
    const gmxBalancePreDistribute = await gmx.balanceOf(mockRewardDistributor.address);

    const distributeTx = await feeDistributor.distribute();
    const distributeReceipt = await distributeTx.wait();
    const distributeEventData = parseLogs(fixture, distributeReceipt)[6].parsedEventData;
    const distributeBlock = await hre.ethers.provider.getBlock(distributeReceipt.blockNumber);
    const distributeTimestamp = distributeBlock.timestamp;
    const lastDistributionTime = await mockRewardDistributor.lastDistributionTime();

    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);

    const keeperCosts = await dataStore.getUintArray(keys.FEE_DISTRIBUTOR_KEEPER_COSTS);

    const keeper1Balance = await hre.ethers.provider.getBalance(user2.address);
    const keeper2Balance = await hre.ethers.provider.getBalance(user3.address);
    const keeper3Balance = await hre.ethers.provider.getBalance(user4.address);

    const sentToKeeper1 = keeperCosts[0].sub(keeper1BalancePreDistribute);
    const sentToKeeper2 = keeperCosts[1].sub(keeper2BalancePreDistribute);
    const feesForKeepers = sentToKeeper1.add(sentToKeeper2);
    const chainlinkFactor = await dataStore.getUint(keys.FEE_DISTRIBUTOR_CHAINLINK_FACTOR);
    const feesForChainlink = totalWntBalance.mul(chainlinkFactor).div(FLOAT_PRECISION);
    let feesForTreasury = totalWntBalance.sub(feesForChainlink);
    const remainingSecondaryFeeToken = totalWntBalance.sub(feesForKeepers).sub(feesForChainlink).sub(feesForTreasury);
    feesForTreasury = feesForTreasury.add(remainingSecondaryFeeToken);
    const feeAmountGmx = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdB));
    const gmxBalancePostDistribute = await gmx.balanceOf(mockRewardDistributor.address);
    const gmxFeesDistributed = gmxBalancePostDistribute.sub(gmxBalancePreDistribute);

    expect(distributionState).to.eq(0);
    expect(lastDistributionTime).to.eq(distributeTimestamp);

    expect(keeper1Balance).to.eq(keeperCosts[0]);
    expect(keeper2Balance).to.eq(keeperCosts[1]);
    expect(keeper3Balance).gte(keeperCosts[2]);

    expect(distributeEventData.feesForKeepers).to.eq(feesForKeepers);
    expect(distributeEventData.feesForChainlink).to.eq(feesForChainlink);
    expect(distributeEventData.feesForTreasury).to.eq(feesForTreasury);
    expect(distributeEventData.feeAmountGmx).to.eq(feeAmountGmx);

    expect(gmxFeesDistributed).to.eq(feeAmountGmx);
    expect(await gmx.balanceOf(mockRewardTracker.address)).to.eq(0);
    expect(await mockRewardDistributor.tokensPerInterval()).to.eq(feeAmountGmx.div(7 * 24 * 60 * 60));
  });

  // bridges gmx with the given adapter, the sender pays the messaging fee and receives any refund
  async function bridgeGmx(adapter, account, dstEid, to, amount) {
    const sendParam = {
      dstEid: dstEid,
      to: addressToBytes32(to),
      amountLD: amount,
      minAmountLD: amount,
      extraOptions: ethers.utils.arrayify("0x"),
      composeMsg: ethers.utils.arrayify("0x"),
      oftCmd: ethers.utils.arrayify("0x"),
    };
    const feeQuote = await adapter.quoteSend(sendParam, false);
    await adapter.connect(account).send(sendParam, { nativeFee: feeQuote.nativeFee, lzTokenFee: 0 }, account.address, {
      value: feeQuote.nativeFee,
    });
  }

  // sets up a distribution in which this chain has a 10,000 gmx deficit: 50,000 gmx of fees
  // (10,000 withdrawable and 40,000 in the FeeDistributorVault) against a calculated amount of 60,000 gmx,
  // chain A has the surplus to cover it
  async function setUpFeeDeficit() {
    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    await mockLzReadResponseChainA.setTotalSupply(expandDecimals(6_000_000, 18));
    await mockRewardTracker.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockLzReadResponseChainC.setTotalSupply(expandDecimals(3_000_000, 18));

    await mockLzReadResponseChainA.setWithdrawableAmount(gmxA.address, expandDecimals(40_000, 18));
    await mockLzReadResponseChainC.setWithdrawableAmount(gmxC.address, expandDecimals(20_000, 18));
    await dataStore.setUint(keys.withdrawableBuybackTokenAmountKey(gmx.address), expandDecimals(10_000, 18));
    await gmx.mint(feeVault.address, expandDecimals(10_000, 18));

    await gmx.mint(wallet.address, expandDecimals(170_000, 18));
    await gmx.approve(mockGmxAdapterB.address, expandDecimals(130_000, 18));
    await bridgeGmx(mockGmxAdapterB, wallet, eidA, user0.address, expandDecimals(120_000, 18));

    await gmx.transfer(feeDistributorVault.address, expandDecimals(40_000, 18));

    await bridgeGmx(mockGmxAdapterB, wallet, eidC, user1.address, expandDecimals(10_000, 18));

    await wallet.sendTransaction({
      to: feeDistributor.address,
      value: expandDecimals(1, 18),
    });
  }

  // configures the FeeHandler so that user8 can buy back usdc fees with batchAmount of gmx
  async function enableGmxBuyback(batchAmount, availableFeeAmount) {
    await config.setUint(keys.BUYBACK_BATCH_AMOUNT, encodeData(["address"], [gmx.address]), batchAmount);
    await config.setUint(keys.BUYBACK_MAX_PRICE_AGE, "0x", 300);
    await config.setUint(
      keys.BUYBACK_MAX_PRICE_IMPACT_FACTOR,
      encodeData(["address"], [gmx.address]),
      percentageToFloat("0.3%")
    );
    await config.setUint(
      keys.BUYBACK_MAX_PRICE_IMPACT_FACTOR,
      encodeData(["address"], [usdc.address]),
      percentageToFloat("0.1%")
    );

    await dataStore.setAddress(
      keys.oracleProviderForTokenKey(oracle.address, gmx.address),
      chainlinkPriceFeedProvider.address
    );
    await dataStore.setAddress(
      keys.oracleProviderForTokenKey(oracle.address, usdc.address),
      chainlinkPriceFeedProvider.address
    );

    await usdc.mint(feeVault.address, availableFeeAmount);
    await dataStore.setUint(keys.buybackAvailableFeeAmountKey(usdc.address, gmx.address), availableFeeAmount);

    await gmx.mint(user8.address, batchAmount);
    await gmx.connect(user8).approve(feeHandler.address, batchAmount);
  }

  async function buybackWithGmx() {
    await feeHandler.connect(user8).buyback(usdc.address, gmx.address, 0, {
      tokens: [usdc.address, gmx.address],
      providers: [chainlinkPriceFeedProvider.address, chainlinkPriceFeedProvider.address],
      data: ["0x", "0x"],
    });
  }

  it("a buyback while the LZRead request is pending is not distributed in the current period", async function () {
    // hold the LZRead response so that it is delivered in a later transaction and the buyback can be
    // executed while the request is pending
    const deferredEndpoint = await deployContract("MockDeferredEndpointV2", []);
    await mockEndpointV2.setDestLzEndpoint(multichainReader.address, deferredEndpoint.address);

    await setUpFeeDeficit();
    await enableGmxBuyback(expandDecimals(2_000, 18), expandDecimals(100_000, 6));

    await commitSnapshots();
    await feeDistributor.initiateDistribute();

    expect(await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE)).to.eq(1);
    expect(await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdB))).to.eq(expandDecimals(50_000, 18));

    await buybackWithGmx();

    expect(await dataStore.getUint(keys.withdrawableBuybackTokenAmountKey(gmx.address))).to.eq(
      expandDecimals(12_000, 18)
    );

    await deferredEndpoint.deliverPayload(mockEndpointV2.address);

    // the buyback proceeds are withdrawn to the FeeDistributorVault along with the snapshotted fees
    expect(await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE)).to.eq(2);
    expect(await gmx.balanceOf(feeDistributorVault.address)).to.eq(expandDecimals(52_000, 18));

    await bridgeGmx(mockGmxAdapterA, user0, eidB, feeDistributorVault.address, expandDecimals(10_000, 18));
    expect(await gmx.balanceOf(feeDistributorVault.address)).to.eq(expandDecimals(62_000, 18));

    const bridgedGmxReceivedTx = await feeDistributor.bridgedGmxReceived();
    const bridgedGmxReceivedEventData = parseLogs(fixture, await bridgedGmxReceivedTx.wait())[0].parsedEventData;

    expect(bridgedGmxReceivedEventData.gmxReceived).to.eq(expandDecimals(10_000, 18));
    expect(await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdB))).to.eq(expandDecimals(60_000, 18));

    const gmxBalancePreDistribute = await gmx.balanceOf(mockRewardDistributor.address);
    await feeDistributor.distribute();
    const gmxFeesDistributed = (await gmx.balanceOf(mockRewardDistributor.address)).sub(gmxBalancePreDistribute);

    expect(gmxFeesDistributed).to.eq(expandDecimals(60_000, 18));
    expect(await gmx.balanceOf(feeDistributorVault.address)).to.eq(expandDecimals(2_000, 18));
    expect(await dataStore.getUint(keys.FEE_DISTRIBUTOR_POST_SNAPSHOT_FEE_AMOUNT_GMX)).to.eq(expandDecimals(2_000, 18));

    // the buyback proceeds are included in the next period's fee amount
    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);
    await wallet.sendTransaction({
      to: feeDistributor.address,
      value: expandDecimals(1, 18),
    });

    await commitSnapshots();
    await feeDistributor.initiateDistribute();

    expect(await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdB))).to.eq(expandDecimals(2_000, 18));
  });

  it("gmx received after the LZRead response is not distributed in the current period", async function () {
    await setUpFeeDeficit();

    await commitSnapshots();
    await feeDistributor.initiateDistribute();

    expect(await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE)).to.eq(2);
    expect(await dataStore.getUint(keys.FEE_DISTRIBUTOR_POST_SNAPSHOT_FEE_AMOUNT_GMX)).to.eq(0);

    await bridgeGmx(mockGmxAdapterA, user0, eidB, feeDistributorVault.address, expandDecimals(10_000, 18));

    await gmx.mint(user8.address, expandDecimals(5_000, 18));
    await gmx.connect(user8).transfer(feeDistributorVault.address, expandDecimals(5_000, 18));
    expect(await gmx.balanceOf(feeDistributorVault.address)).to.eq(expandDecimals(65_000, 18));

    await feeDistributor.bridgedGmxReceived();

    expect(await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdB))).to.eq(expandDecimals(60_000, 18));

    const gmxBalancePreDistribute = await gmx.balanceOf(mockRewardDistributor.address);
    await feeDistributor.distribute();
    const gmxFeesDistributed = (await gmx.balanceOf(mockRewardDistributor.address)).sub(gmxBalancePreDistribute);

    expect(gmxFeesDistributed).to.eq(expandDecimals(60_000, 18));
    expect(await gmx.balanceOf(feeDistributorVault.address)).to.eq(expandDecimals(5_000, 18));
  });

  it("a buyback while the LZRead request is pending does not cover a gmx deficit", async function () {
    const deferredEndpoint = await deployContract("MockDeferredEndpointV2", []);
    await mockEndpointV2.setDestLzEndpoint(multichainReader.address, deferredEndpoint.address);

    await setUpFeeDeficit();
    await enableGmxBuyback(expandDecimals(10_000, 18), expandDecimals(250_000, 6));

    await commitSnapshots();
    await feeDistributor.initiateDistribute();

    await buybackWithGmx();

    await deferredEndpoint.deliverPayload(mockEndpointV2.address);

    // the buyback covers the 10,000 gmx deficit in the FeeDistributorVault, but no gmx has been bridged
    expect(await gmx.balanceOf(feeDistributorVault.address)).to.eq(expandDecimals(60_000, 18));

    await expect(feeDistributor.bridgedGmxReceived())
      .to.be.revertedWithCustomError(errorsContract, "BridgedAmountNotSufficient")
      .withArgs(expandDecimals(59_900, 18), expandDecimals(50_000, 18));
  });

  it("bridged gmx received before the LZRead response is counted while a buyback is still excluded", async function () {
    const deferredEndpoint = await deployContract("MockDeferredEndpointV2", []);
    await mockEndpointV2.setDestLzEndpoint(multichainReader.address, deferredEndpoint.address);

    await setUpFeeDeficit();
    await enableGmxBuyback(expandDecimals(2_000, 18), expandDecimals(100_000, 6));

    await commitSnapshots();
    await feeDistributor.initiateDistribute();

    await buybackWithGmx();

    // the bridged gmx arrives before the LZRead response is delivered
    await bridgeGmx(mockGmxAdapterA, user0, eidB, feeDistributorVault.address, expandDecimals(10_000, 18));

    await deferredEndpoint.deliverPayload(mockEndpointV2.address);

    expect(await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE)).to.eq(2);
    expect(await dataStore.getUint(keys.FEE_DISTRIBUTOR_POST_SNAPSHOT_FEE_AMOUNT_GMX)).to.eq(expandDecimals(2_000, 18));
    expect(await gmx.balanceOf(feeDistributorVault.address)).to.eq(expandDecimals(62_000, 18));

    const bridgedGmxReceivedTx = await feeDistributor.bridgedGmxReceived();
    const bridgedGmxReceivedEventData = parseLogs(fixture, await bridgedGmxReceivedTx.wait())[0].parsedEventData;

    expect(bridgedGmxReceivedEventData.gmxReceived).to.eq(expandDecimals(10_000, 18));
    expect(await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdB))).to.eq(expandDecimals(60_000, 18));

    const gmxBalancePreDistribute = await gmx.balanceOf(mockRewardDistributor.address);
    await feeDistributor.distribute();
    const gmxFeesDistributed = (await gmx.balanceOf(mockRewardDistributor.address)).sub(gmxBalancePreDistribute);

    expect(gmxFeesDistributed).to.eq(expandDecimals(60_000, 18));
    expect(await gmx.balanceOf(feeDistributorVault.address)).to.eq(expandDecimals(2_000, 18));
  });

  it("distribute() for fee surplus", async function () {
    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);
    expect(distributionState).to.eq(0);

    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    await mockLzReadResponseChainA.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockRewardTracker.setTotalSupply(expandDecimals(6_000_000, 18));
    await mockLzReadResponseChainC.setTotalSupply(expandDecimals(3_000_000, 18));

    await mockLzReadResponseChainA.setWithdrawableAmount(gmxA.address, expandDecimals(10_000, 18));
    await mockLzReadResponseChainC.setWithdrawableAmount(gmxC.address, expandDecimals(20_000, 18));
    await dataStore.setUint(keys.withdrawableBuybackTokenAmountKey(gmx.address), expandDecimals(40_000, 18));
    await gmx.mint(feeVault.address, expandDecimals(40_000, 18));

    await gmx.mint(wallet.address, expandDecimals(170_000, 18));
    await gmx.approve(mockGmxAdapterB.address, expandDecimals(50_000, 18));
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

    const feeReceiverAmountBeforeBridgingA = await gmxA.balanceOf(user0.address);
    const feeReceiverAmountBeforeBridgingB = await gmx.balanceOf(feeDistributorVault.address);
    const feeReceiverAmountBeforeBridgingC = await gmxC.balanceOf(user1.address);

    await commitSnapshots();
    const tx = await feeDistributor.initiateDistribute();
    const receipt = await tx.wait();
    const block = await hre.ethers.provider.getBlock(receipt.blockNumber);
    const timestamp = block.timestamp;

    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);

    const readResponseTimestamp = await dataStore.getUint(keys.FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP);

    const feeDistributionInitiatedEventData = parseLogs(fixture, receipt)[18].parsedEventData;
    const feeDistributionDataReceivedEventData = parseLogs(fixture, receipt)[15].parsedEventData;

    const feeAmountGmxA = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdA));
    const feeAmountGmxB = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdB));
    const feeAmountGmxC = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdC));
    const totalFeeAmountGmx = await dataStore.getUint(keys.FEE_DISTRIBUTOR_TOTAL_FEE_AMOUNT_GMX);

    const stakedGmxA = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainIdA));
    const stakedGmxB = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainIdB));
    const stakedGmxC = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainIdC));
    const totalStakedGmx = await dataStore.getUint(keys.FEE_DISTRIBUTOR_TOTAL_STAKED_GMX);

    const feeReceiverAmountAfterBridgingA = await gmxA.balanceOf(user0.address);
    const feeReceiverAmountAfterBridgingB = await gmx.balanceOf(feeDistributorVault.address);
    const feeReceiverAmountAfterBridgingC = await gmxC.balanceOf(user1.address);

    expect(distributionState).to.eq(3);

    expect(readResponseTimestamp).to.equal(timestamp);

    expect(feeDistributionInitiatedEventData.numberOfChainsReadRequests).to.equal(2);
    expect(feeDistributionDataReceivedEventData.totalGmxBridgedOut).to.equal(expandDecimals(40_000, 18));

    expect(feeAmountGmxA).to.equal(expandDecimals(50_000, 18));
    expect(feeAmountGmxB).to.equal(expandDecimals(120_000, 18));
    expect(feeAmountGmxC).to.equal(expandDecimals(30_000, 18));
    expect(totalFeeAmountGmx).to.equal(expandDecimals(240_000, 18));

    expect(stakedGmxA).to.equal(expandDecimals(3_000_000, 18));
    expect(stakedGmxB).to.equal(expandDecimals(6_000_000, 18));
    expect(stakedGmxC).to.equal(expandDecimals(3_000_000, 18));
    expect(totalStakedGmx).to.equal(expandDecimals(12_000_000, 18));

    expect(feeReceiverAmountBeforeBridgingA).to.equal(expandDecimals(40_000, 18));
    expect(feeReceiverAmountBeforeBridgingB).to.equal(expandDecimals(120_000, 18));
    expect(feeReceiverAmountBeforeBridgingC).to.equal(expandDecimals(10_000, 18));

    expect(feeReceiverAmountAfterBridgingA).to.equal(expandDecimals(50_000, 18));
    expect(feeReceiverAmountAfterBridgingB).to.equal(expandDecimals(120_000, 18));
    expect(feeReceiverAmountAfterBridgingC).to.equal(expandDecimals(40_000, 18));

    const keeper1BalancePreDistribute = await hre.ethers.provider.getBalance(user2.address);
    const keeper2BalancePreDistribute = await hre.ethers.provider.getBalance(user3.address);
    const totalWntBalance = await wnt.balanceOf(feeVault.address);
    const gmxBalancePreDistribute = await gmx.balanceOf(mockRewardDistributor.address);

    const distributeTx = await feeDistributor.distribute();
    const distributeReceipt = await distributeTx.wait();
    const distributeEventData = parseLogs(fixture, distributeReceipt)[6].parsedEventData;
    const distributeBlock = await hre.ethers.provider.getBlock(distributeReceipt.blockNumber);
    const distributeTimestamp = distributeBlock.timestamp;
    const lastDistributionTime = await mockRewardDistributor.lastDistributionTime();

    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);

    const keeperCosts = await dataStore.getUintArray(keys.FEE_DISTRIBUTOR_KEEPER_COSTS);

    const keeper1Balance = await hre.ethers.provider.getBalance(user2.address);
    const keeper2Balance = await hre.ethers.provider.getBalance(user3.address);
    const keeper3Balance = await hre.ethers.provider.getBalance(user4.address);

    const sentToKeeper1 = keeperCosts[0].sub(keeper1BalancePreDistribute);
    const sentToKeeper2 = keeperCosts[1].sub(keeper2BalancePreDistribute);
    const feesForKeepers = sentToKeeper1.add(sentToKeeper2);
    const chainlinkFactor = await dataStore.getUint(keys.FEE_DISTRIBUTOR_CHAINLINK_FACTOR);
    const feesForChainlink = totalWntBalance.mul(chainlinkFactor).div(FLOAT_PRECISION);
    let feesForTreasury = totalWntBalance.sub(feesForChainlink);
    const remainingSecondaryFeeToken = totalWntBalance.sub(feesForKeepers).sub(feesForChainlink).sub(feesForTreasury);
    feesForTreasury = feesForTreasury.add(remainingSecondaryFeeToken);
    const feeAmountGmx = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdB));
    const gmxBalancePostDistribute = await gmx.balanceOf(mockRewardDistributor.address);
    const gmxFeesDistributed = gmxBalancePostDistribute.sub(gmxBalancePreDistribute);

    expect(distributionState).to.eq(0);
    expect(lastDistributionTime).to.eq(distributeTimestamp);

    expect(keeper1Balance).to.eq(keeperCosts[0]);
    expect(keeper2Balance).to.eq(keeperCosts[1]);
    expect(keeper3Balance).gte(keeperCosts[2]);

    expect(distributeEventData.feesForKeepers).to.eq(feesForKeepers);
    expect(distributeEventData.feesForChainlink).to.eq(feesForChainlink);
    expect(distributeEventData.feesForTreasury).to.eq(feesForTreasury);
    expect(distributeEventData.feeAmountGmx).to.eq(feeAmountGmx);

    expect(gmxFeesDistributed).to.eq(feeAmountGmx);
    expect(await gmx.balanceOf(mockRewardTracker.address)).to.eq(0);
    expect(await mockRewardDistributor.tokensPerInterval()).to.eq(feeAmountGmx.div(7 * 24 * 60 * 60));
  });

  it("weekly gmx emissions stream through the reward distributor to stakers across distributions", async function () {
    const secondsPerWeek = 7 * 24 * 60 * 60;

    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    await mockLzReadResponseChainA.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockRewardTracker.setTotalSupply(expandDecimals(6_000_000, 18));
    await mockLzReadResponseChainC.setTotalSupply(expandDecimals(3_000_000, 18));

    await mockLzReadResponseChainA.setWithdrawableAmount(gmxA.address, expandDecimals(10_000, 18));
    await mockLzReadResponseChainC.setWithdrawableAmount(gmxC.address, expandDecimals(20_000, 18));
    await dataStore.setUint(keys.withdrawableBuybackTokenAmountKey(gmx.address), expandDecimals(40_000, 18));
    await gmx.mint(feeVault.address, expandDecimals(40_000, 18));

    await gmx.mint(wallet.address, expandDecimals(170_000, 18));
    await gmx.approve(mockGmxAdapterB.address, expandDecimals(50_000, 18));
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
    await mockGmxAdapterB.send(sendParam, { nativeFee: feeQuote.nativeFee, lzTokenFee: 0 }, wallet.address, {
      value: feeQuote.nativeFee,
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
    await mockGmxAdapterB.send(sendParam, { nativeFee: feeQuote.nativeFee, lzTokenFee: 0 }, wallet.address, {
      value: feeQuote.nativeFee,
    });

    await wallet.sendTransaction({ to: feeDistributor.address, value: expandDecimals(1, 18) });

    await commitSnapshots();
    await feeDistributor.initiateDistribute();
    const distributeTx1 = await feeDistributor.distribute();
    const distributeReceipt1 = await distributeTx1.wait();
    const distributeTimestamp1 = (await hre.ethers.provider.getBlock(distributeReceipt1.blockNumber)).timestamp;

    const tranche1 = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdB));
    const rate1 = tranche1.div(secondsPerWeek);

    expect(await gmx.balanceOf(mockRewardDistributor.address)).to.eq(tranche1);
    expect(await gmx.balanceOf(mockRewardTracker.address)).to.eq(0);
    expect(await mockRewardDistributor.tokensPerInterval()).to.eq(rate1);
    expect(await mockRewardDistributor.lastDistributionTime()).to.eq(distributeTimestamp1);

    const stakeAmount = expandDecimals(2_000_000, 18);
    const stakeTx = await mockRewardTracker.connect(user7).stake(stakeAmount);
    const stakeReceipt = await stakeTx.wait();
    const stakeTimestamp = (await hre.ethers.provider.getBlock(stakeReceipt.blockNumber)).timestamp;
    const totalStaked = expandDecimals(8_000_000, 18);

    await hre.ethers.provider.send("evm_increaseTime", [3 * 24 * 60 * 60]);
    await hre.ethers.provider.send("evm_mine", []);
    await mockRewardTracker.updateRewards();

    const claimable1 = await mockRewardTracker.claimable(user7.address);
    const claimTx1 = await mockRewardTracker.connect(user7).claim(user7.address);
    const claimReceipt1 = await claimTx1.wait();
    const claimTimestamp1 = (await hre.ethers.provider.getBlock(claimReceipt1.blockNumber)).timestamp;
    const received1 = await gmx.balanceOf(user7.address);

    const expected1 = rate1
      .mul(claimTimestamp1 - stakeTimestamp)
      .mul(stakeAmount)
      .div(totalStaked);
    expect(received1).to.be.closeTo(expected1, expandDecimals(1, 15));
    expect(claimable1).to.be.closeTo(received1, rate1.mul(5));
    expect(await gmx.balanceOf(mockRewardDistributor.address)).to.eq(
      tranche1.sub(rate1.mul(claimTimestamp1 - distributeTimestamp1))
    );

    await gmxA.connect(user0).transfer(user5.address, await gmxA.balanceOf(user0.address));
    await gmxC.connect(user1).transfer(user5.address, await gmxC.balanceOf(user1.address));
    await mockLzReadResponseChainA.setWithdrawableAmount(gmxA.address, 0);
    await mockLzReadResponseChainC.setWithdrawableAmount(gmxC.address, 0);

    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    await hre.ethers.provider.send("evm_increaseTime", [120]);
    await hre.ethers.provider.send("evm_mine", []);

    await gmx.mint(wallet.address, expandDecimals(120_000, 18));
    await gmx.transfer(feeDistributorVault.address, expandDecimals(120_000, 18));
    await wallet.sendTransaction({ to: feeDistributor.address, value: expandDecimals(1, 18) });

    const distributorBalancePreWeek2 = await gmx.balanceOf(mockRewardDistributor.address);

    await commitSnapshots();
    await feeDistributor.initiateDistribute();
    const distributeTx2 = await feeDistributor.distribute();
    const distributeReceipt2 = await distributeTx2.wait();
    const distributeTimestamp2 = (await hre.ethers.provider.getBlock(distributeReceipt2.blockNumber)).timestamp;

    const tranche2 = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdB));

    const accruedWeek1 = rate1.mul(distributeTimestamp2 - claimTimestamp1);
    const flushed = accruedWeek1.gt(distributorBalancePreWeek2) ? distributorBalancePreWeek2 : accruedWeek1;
    const rate2 = distributorBalancePreWeek2.sub(flushed).add(tranche2).div(secondsPerWeek);

    expect(await gmx.balanceOf(mockRewardDistributor.address)).to.eq(
      distributorBalancePreWeek2.sub(flushed).add(tranche2)
    );
    expect(await mockRewardDistributor.tokensPerInterval()).to.eq(rate2);
    expect(await mockRewardDistributor.lastDistributionTime()).to.eq(distributeTimestamp2);

    await hre.ethers.provider.send("evm_increaseTime", [6 * 24 * 60 * 60]);
    await hre.ethers.provider.send("evm_mine", []);

    const claimTx2 = await mockRewardTracker.connect(user7).claim(user7.address);
    const claimReceipt2 = await claimTx2.wait();
    const claimTimestamp2 = (await hre.ethers.provider.getBlock(claimReceipt2.blockNumber)).timestamp;
    const received2 = (await gmx.balanceOf(user7.address)).sub(received1);

    const expected2 = flushed
      .add(rate2.mul(claimTimestamp2 - distributeTimestamp2))
      .mul(stakeAmount)
      .div(totalStaked);
    expect(received2).to.be.closeTo(expected2, expandDecimals(1, 15));

    const distributorBalanceEnd = await gmx.balanceOf(mockRewardDistributor.address);
    const totalStreamed = tranche1.add(tranche2).sub(distributorBalanceEnd);
    expect(totalStreamed).to.be.gt(tranche1);
    expect(await gmx.balanceOf(mockRewardTracker.address)).to.eq(totalStreamed.sub(received1).sub(received2));
  });

  it("adjacent distributions across a week boundary carry the unaccrued remainder into the new rate", async function () {
    const secondsPerWeek = 7 * 24 * 60 * 60;

    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    await mockLzReadResponseChainA.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockRewardTracker.setTotalSupply(expandDecimals(6_000_000, 18));
    await mockLzReadResponseChainC.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockLzReadResponseChainA.setWithdrawableAmount(gmxA.address, 0);
    await mockLzReadResponseChainC.setWithdrawableAmount(gmxC.address, 0);

    await gmx.mint(wallet.address, expandDecimals(120_000, 18));
    await gmx.transfer(feeDistributorVault.address, expandDecimals(120_000, 18));
    await wallet.sendTransaction({ to: feeDistributor.address, value: expandDecimals(1, 18) });

    await feeDistributorConfig.moveToEndOfCurrentDistributionWeek(distributionDay);

    await commitSnapshots();
    await feeDistributor.initiateDistribute();
    const distributeTx1 = await feeDistributor.distribute();
    const distributeReceipt1 = await distributeTx1.wait();
    const distributeTimestamp1 = (await hre.ethers.provider.getBlock(distributeReceipt1.blockNumber)).timestamp;

    const tranche1 = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdB));
    const rate1 = tranche1.div(secondsPerWeek);

    expect(await gmx.balanceOf(mockRewardDistributor.address)).to.eq(tranche1);
    expect(await mockRewardDistributor.tokensPerInterval()).to.eq(rate1);

    const stakeAmount = expandDecimals(2_000_000, 18);
    const stakeTx = await mockRewardTracker.connect(user7).stake(stakeAmount);
    const stakeReceipt = await stakeTx.wait();
    const stakeTimestamp = (await hre.ethers.provider.getBlock(stakeReceipt.blockNumber)).timestamp;
    const totalStaked = expandDecimals(8_000_000, 18);

    await gmxA.connect(user0).transfer(user5.address, await gmxA.balanceOf(user0.address));
    await gmxC.connect(user1).transfer(user5.address, await gmxC.balanceOf(user1.address));

    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    await gmx.mint(wallet.address, expandDecimals(120_000, 18));
    await gmx.transfer(feeDistributorVault.address, expandDecimals(120_000, 18));
    await wallet.sendTransaction({ to: feeDistributor.address, value: expandDecimals(1, 18) });

    const distributorBalancePreWeek2 = await gmx.balanceOf(mockRewardDistributor.address);
    const lastDistributionTimePreWeek2 = await mockRewardDistributor.lastDistributionTime();

    await commitSnapshots();
    await feeDistributor.initiateDistribute();
    const distributeTx2 = await feeDistributor.distribute();
    const distributeReceipt2 = await distributeTx2.wait();
    const distributeTimestamp2 = (await hre.ethers.provider.getBlock(distributeReceipt2.blockNumber)).timestamp;

    const tranche2 = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdB));

    expect(distributeTimestamp2 - distributeTimestamp1).to.be.lt(600);

    const accruedWeek1 = rate1.mul(distributeTimestamp2 - lastDistributionTimePreWeek2.toNumber());
    const flushed = accruedWeek1.gt(distributorBalancePreWeek2) ? distributorBalancePreWeek2 : accruedWeek1;
    const remainder = distributorBalancePreWeek2.sub(flushed);
    const rate2 = remainder.add(tranche2).div(secondsPerWeek);

    expect(remainder).to.be.gt(tranche1.mul(99).div(100));
    expect(await gmx.balanceOf(mockRewardDistributor.address)).to.eq(remainder.add(tranche2));
    expect(await mockRewardDistributor.tokensPerInterval()).to.eq(rate2);
    expect(rate2).to.be.gt(tranche2.div(secondsPerWeek));
    expect(await mockRewardDistributor.lastDistributionTime()).to.eq(distributeTimestamp2);

    await hre.ethers.provider.send("evm_increaseTime", [8 * 24 * 60 * 60]);
    await hre.ethers.provider.send("evm_mine", []);
    await mockRewardTracker.updateRewards();

    expect(await gmx.balanceOf(mockRewardDistributor.address)).to.eq(0);

    await mockRewardTracker.connect(user7).claim(user7.address);
    const received = await gmx.balanceOf(user7.address);

    const preStakeEmissions = rate1.mul(stakeTimestamp - distributeTimestamp1);
    const expected = tranche1
      .add(tranche2)
      .sub(preStakeEmissions)
      .mul(stakeAmount)
      .div(totalStaked);
    expect(received).to.be.closeTo(expected, expandDecimals(1, 15));
    expect(await gmx.balanceOf(mockRewardTracker.address)).to.eq(tranche1.add(tranche2).sub(received));
  });

  it("late distribution after a missed week caps the flush at the old funding without raiding the new tranche", async function () {
    const secondsPerWeek = 7 * 24 * 60 * 60;

    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    await mockLzReadResponseChainA.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockRewardTracker.setTotalSupply(expandDecimals(6_000_000, 18));
    await mockLzReadResponseChainC.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockLzReadResponseChainA.setWithdrawableAmount(gmxA.address, 0);
    await mockLzReadResponseChainC.setWithdrawableAmount(gmxC.address, 0);

    await gmx.mint(wallet.address, expandDecimals(120_000, 18));
    await gmx.transfer(feeDistributorVault.address, expandDecimals(120_000, 18));
    await wallet.sendTransaction({ to: feeDistributor.address, value: expandDecimals(1, 18) });

    await commitSnapshots();
    await feeDistributor.initiateDistribute();
    const distributeTx1 = await feeDistributor.distribute();
    const distributeReceipt1 = await distributeTx1.wait();
    const distributeTimestamp1 = (await hre.ethers.provider.getBlock(distributeReceipt1.blockNumber)).timestamp;

    const tranche1 = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdB));
    const rate1 = tranche1.div(secondsPerWeek);

    expect(await gmx.balanceOf(mockRewardDistributor.address)).to.eq(tranche1);
    expect(await mockRewardDistributor.tokensPerInterval()).to.eq(rate1);

    await gmxA.connect(user0).transfer(user5.address, await gmxA.balanceOf(user0.address));
    await gmxC.connect(user1).transfer(user5.address, await gmxC.balanceOf(user1.address));

    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);
    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    await gmx.mint(wallet.address, expandDecimals(120_000, 18));
    await gmx.transfer(feeDistributorVault.address, expandDecimals(120_000, 18));
    await wallet.sendTransaction({ to: feeDistributor.address, value: expandDecimals(1, 18) });

    const trackerBalancePreWeek3 = await gmx.balanceOf(mockRewardTracker.address);

    await commitSnapshots();
    await feeDistributor.initiateDistribute();
    const distributeTx2 = await feeDistributor.distribute();
    const distributeReceipt2 = await distributeTx2.wait();
    const distributeTimestamp2 = (await hre.ethers.provider.getBlock(distributeReceipt2.blockNumber)).timestamp;

    const tranche2 = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdB));

    expect(rate1.mul(distributeTimestamp2 - distributeTimestamp1)).to.be.gt(tranche1);
    expect(await gmx.balanceOf(mockRewardTracker.address)).to.eq(trackerBalancePreWeek3.add(tranche1));
    expect(await gmx.balanceOf(mockRewardDistributor.address)).to.eq(tranche2);
    expect(await mockRewardDistributor.tokensPerInterval()).to.eq(tranche2.div(secondsPerWeek));
    expect(await mockRewardDistributor.lastDistributionTime()).to.eq(distributeTimestamp2);
  });

  it("the first distribution folds a pre-existing distributor balance and schedule into the new rate", async function () {
    const secondsPerWeek = 7 * 24 * 60 * 60;

    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    const legacyBalance = expandDecimals(50_000, 18);
    const legacyRate = expandDecimals(1, 16);
    await gmx.mint(mockRewardDistributor.address, legacyBalance);
    await mockRewardDistributor.updateLastDistributionTime();
    await mockRewardDistributor.setTokensPerInterval(legacyRate);

    await mockLzReadResponseChainA.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockRewardTracker.setTotalSupply(expandDecimals(6_000_000, 18));
    await mockLzReadResponseChainC.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockLzReadResponseChainA.setWithdrawableAmount(gmxA.address, 0);
    await mockLzReadResponseChainC.setWithdrawableAmount(gmxC.address, 0);

    await gmx.mint(wallet.address, expandDecimals(120_000, 18));
    await gmx.transfer(feeDistributorVault.address, expandDecimals(120_000, 18));
    await wallet.sendTransaction({ to: feeDistributor.address, value: expandDecimals(1, 18) });

    const lastDistributionTimePreDistribute = await mockRewardDistributor.lastDistributionTime();
    const trackerBalancePreDistribute = await gmx.balanceOf(mockRewardTracker.address);

    await commitSnapshots();
    await feeDistributor.initiateDistribute();
    const distributeTx = await feeDistributor.distribute();
    const distributeReceipt = await distributeTx.wait();
    const distributeTimestamp = (await hre.ethers.provider.getBlock(distributeReceipt.blockNumber)).timestamp;

    const tranche1 = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdB));

    const flushed = legacyRate.mul(distributeTimestamp - lastDistributionTimePreDistribute.toNumber());
    const folded = legacyBalance.sub(flushed);

    expect(flushed).to.be.lt(legacyBalance);
    expect(await gmx.balanceOf(mockRewardTracker.address)).to.eq(trackerBalancePreDistribute.add(flushed));
    expect(await gmx.balanceOf(mockRewardDistributor.address)).to.eq(folded.add(tranche1));
    expect(await mockRewardDistributor.tokensPerInterval()).to.eq(folded.add(tranche1).div(secondsPerWeek));
    expect(await mockRewardDistributor.lastDistributionTime()).to.eq(distributeTimestamp);
  });

  it("re-enabling gmx fee distribution re-bases the last distribution time", async function () {
    const secondsPerWeek = 7 * 24 * 60 * 60;

    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    await mockLzReadResponseChainA.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockRewardTracker.setTotalSupply(expandDecimals(6_000_000, 18));
    await mockLzReadResponseChainC.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockLzReadResponseChainA.setWithdrawableAmount(gmxA.address, 0);
    await mockLzReadResponseChainC.setWithdrawableAmount(gmxC.address, 0);

    await gmx.mint(wallet.address, expandDecimals(120_000, 18));
    await gmx.transfer(feeDistributorVault.address, expandDecimals(120_000, 18));
    await wallet.sendTransaction({ to: feeDistributor.address, value: expandDecimals(1, 18) });

    await commitSnapshots();
    await feeDistributor.initiateDistribute();
    const distributeTx1 = await feeDistributor.distribute();
    const distributeReceipt1 = await distributeTx1.wait();
    const distributeTimestamp1 = (await hre.ethers.provider.getBlock(distributeReceipt1.blockNumber)).timestamp;

    const tranche1 = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdB));
    const rate1 = tranche1.div(secondsPerWeek);

    expect(await gmx.balanceOf(mockRewardDistributor.address)).to.eq(tranche1);
    expect(await mockRewardDistributor.tokensPerInterval()).to.eq(rate1);

    await config.setBool(keys.FEE_DISTRIBUTOR_DISTRIBUTE_FEES, "0x", false);
    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    await gmx.mint(wallet.address, expandDecimals(120_000, 18));
    await gmx.transfer(feeDistributorVault.address, expandDecimals(120_000, 18));
    await wallet.sendTransaction({ to: feeDistributor.address, value: expandDecimals(1, 18) });

    const treasuryBalancePreWeek2 = await gmx.balanceOf(user6.address);

    await commitSnapshots();
    await feeDistributor.initiateDistribute();
    const distributeTx2 = await feeDistributor.distribute();
    const distributeReceipt2 = await distributeTx2.wait();
    const distributeTimestamp2 = (await hre.ethers.provider.getBlock(distributeReceipt2.blockNumber)).timestamp;

    const tranche2 = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdB));

    const accruedWeek1 = rate1.mul(distributeTimestamp2 - distributeTimestamp1);
    const flushed = accruedWeek1.gt(tranche1) ? tranche1 : accruedWeek1;

    expect((await gmx.balanceOf(user6.address)).sub(treasuryBalancePreWeek2)).to.eq(tranche2);
    expect(await gmx.balanceOf(mockRewardDistributor.address)).to.eq(tranche1.sub(flushed));
    expect(await mockRewardDistributor.tokensPerInterval()).to.eq(0);
    expect(await mockRewardDistributor.lastDistributionTime()).to.eq(distributeTimestamp2);

    await config.setBool(keys.FEE_DISTRIBUTOR_DISTRIBUTE_FEES, "0x", true);
    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    await gmx.mint(wallet.address, expandDecimals(120_000, 18));
    await gmx.transfer(feeDistributorVault.address, expandDecimals(120_000, 18));
    await wallet.sendTransaction({ to: feeDistributor.address, value: expandDecimals(1, 18) });

    const distributorBalancePreWeek3 = await gmx.balanceOf(mockRewardDistributor.address);

    await commitSnapshots();
    await feeDistributor.initiateDistribute();
    const distributeTx3 = await feeDistributor.distribute();
    const distributeReceipt3 = await distributeTx3.wait();
    const distributeTimestamp3 = (await hre.ethers.provider.getBlock(distributeReceipt3.blockNumber)).timestamp;

    const tranche3 = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdB));

    expect(await mockRewardDistributor.lastDistributionTime()).to.eq(distributeTimestamp3);
    expect(await mockRewardDistributor.tokensPerInterval()).to.eq(
      distributorBalancePreWeek3.add(tranche3).div(secondsPerWeek)
    );
    expect(await gmx.balanceOf(mockRewardDistributor.address)).to.eq(distributorBalancePreWeek3.add(tranche3));
  });

  it("distribute() reverts if the reward tracker's distributor does not emit gmx", async function () {
    const badDistributor = await deployContract("MockRewardDistributorV1", [wnt.address]);
    const badTracker = await deployContract("MockRewardTrackerV1", [badDistributor.address]);
    await badDistributor.setRewardTracker(badTracker.address);
    await badTracker.setTotalSupply(expandDecimals(6_000_000, 18));
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdB, feeDistributorConfig.rewardTrackerKey]),
      badTracker.address
    );

    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    await mockLzReadResponseChainA.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockLzReadResponseChainC.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockLzReadResponseChainA.setWithdrawableAmount(gmxA.address, 0);
    await mockLzReadResponseChainC.setWithdrawableAmount(gmxC.address, 0);

    await gmx.mint(wallet.address, expandDecimals(120_000, 18));
    await gmx.transfer(feeDistributorVault.address, expandDecimals(120_000, 18));
    await wallet.sendTransaction({ to: feeDistributor.address, value: expandDecimals(1, 18) });

    await commitSnapshots();
    await feeDistributor.initiateDistribute();
    await expect(feeDistributor.distribute())
      .to.be.revertedWithCustomError(errorsContract, "InvalidDistributorRewardToken")
      .withArgs(wnt.address, gmx.address);
  });

  it("distribute() does not distribute fees if FEE_DISTRIBUTOR_DISTRIBUTE_FEES = false", async function () {
    await config.setBool(keys.FEE_DISTRIBUTOR_DISTRIBUTE_FEES, "0x", false);

    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);
    expect(distributionState).to.eq(0);

    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    await mockLzReadResponseChainA.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockRewardTracker.setTotalSupply(expandDecimals(6_000_000, 18));
    await mockLzReadResponseChainC.setTotalSupply(expandDecimals(3_000_000, 18));

    await mockLzReadResponseChainA.setWithdrawableAmount(gmxA.address, expandDecimals(10_000, 18));
    await mockLzReadResponseChainC.setWithdrawableAmount(gmxC.address, expandDecimals(20_000, 18));
    await dataStore.setUint(keys.withdrawableBuybackTokenAmountKey(gmx.address), expandDecimals(40_000, 18));
    await gmx.mint(feeVault.address, expandDecimals(40_000, 18));

    await gmx.mint(wallet.address, expandDecimals(170_000, 18));
    await gmx.approve(mockGmxAdapterB.address, expandDecimals(50_000, 18));
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

    const feeReceiverAmountBeforeBridgingA = await gmxA.balanceOf(user0.address);
    const feeReceiverAmountBeforeBridgingB = await gmx.balanceOf(feeDistributorVault.address);
    const feeReceiverAmountBeforeBridgingC = await gmxC.balanceOf(user1.address);

    await commitSnapshots();
    const tx = await feeDistributor.initiateDistribute();
    const receipt = await tx.wait();
    const block = await hre.ethers.provider.getBlock(receipt.blockNumber);
    const timestamp = block.timestamp;

    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);

    const readResponseTimestamp = await dataStore.getUint(keys.FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP);

    const feeDistributionInitiatedEventData = parseLogs(fixture, receipt)[4].parsedEventData;
    const feeDistributionDataReceivedEventData = parseLogs(fixture, receipt)[1].parsedEventData;

    const feeAmountGmxA = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdA));
    const feeAmountGmxB = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdB));
    const feeAmountGmxC = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdC));
    const totalFeeAmountGmx = await dataStore.getUint(keys.FEE_DISTRIBUTOR_TOTAL_FEE_AMOUNT_GMX);

    const stakedGmxA = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainIdA));
    const stakedGmxB = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainIdB));
    const stakedGmxC = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainIdC));
    const totalStakedGmx = await dataStore.getUint(keys.FEE_DISTRIBUTOR_TOTAL_STAKED_GMX);

    const feeReceiverAmountAfterBridgingA = await gmxA.balanceOf(user0.address);
    const feeReceiverAmountAfterBridgingB = await gmx.balanceOf(feeDistributorVault.address);
    const feeReceiverAmountAfterBridgingC = await gmxC.balanceOf(user1.address);

    expect(distributionState).to.eq(3);

    expect(readResponseTimestamp).to.equal(timestamp);

    expect(feeDistributionInitiatedEventData.numberOfChainsReadRequests).to.equal(2);
    expect(feeDistributionDataReceivedEventData.totalGmxBridgedOut).to.equal(expandDecimals(0, 18));

    expect(feeAmountGmxA).to.equal(expandDecimals(50_000, 18));
    expect(feeAmountGmxB).to.equal(expandDecimals(160_000, 18));
    expect(feeAmountGmxC).to.equal(expandDecimals(30_000, 18));
    expect(totalFeeAmountGmx).to.equal(expandDecimals(240_000, 18));

    expect(stakedGmxA).to.equal(expandDecimals(3_000_000, 18));
    expect(stakedGmxB).to.equal(expandDecimals(6_000_000, 18));
    expect(stakedGmxC).to.equal(expandDecimals(3_000_000, 18));
    expect(totalStakedGmx).to.equal(expandDecimals(12_000_000, 18));

    expect(feeReceiverAmountBeforeBridgingA).to.equal(expandDecimals(40_000, 18));
    expect(feeReceiverAmountBeforeBridgingB).to.equal(expandDecimals(120_000, 18));
    expect(feeReceiverAmountBeforeBridgingC).to.equal(expandDecimals(10_000, 18));

    expect(feeReceiverAmountAfterBridgingA).to.equal(expandDecimals(40_000, 18));
    expect(feeReceiverAmountAfterBridgingB).to.equal(expandDecimals(160_000, 18));
    expect(feeReceiverAmountAfterBridgingC).to.equal(expandDecimals(10_000, 18));

    const keeper1BalancePreDistribute = await hre.ethers.provider.getBalance(user2.address);
    const keeper2BalancePreDistribute = await hre.ethers.provider.getBalance(user3.address);
    const totalWntBalance = await wnt.balanceOf(feeVault.address);
    const gmxBalancePreDistribute = await gmx.balanceOf(mockRewardDistributor.address);

    const distributeTx = await feeDistributor.distribute();
    const distributeReceipt = await distributeTx.wait();
    const distributeEventData = parseLogs(fixture, distributeReceipt)[6].parsedEventData;
    const lastDistributionTime = await mockRewardDistributor.lastDistributionTime();

    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);

    const keeperCosts = await dataStore.getUintArray(keys.FEE_DISTRIBUTOR_KEEPER_COSTS);

    const keeper1Balance = await hre.ethers.provider.getBalance(user2.address);
    const keeper2Balance = await hre.ethers.provider.getBalance(user3.address);
    const keeper3Balance = await hre.ethers.provider.getBalance(user4.address);

    const sentToKeeper1 = keeperCosts[0].sub(keeper1BalancePreDistribute);
    const sentToKeeper2 = keeperCosts[1].sub(keeper2BalancePreDistribute);
    const feesForKeepers = sentToKeeper1.add(sentToKeeper2);
    const chainlinkFactor = await dataStore.getUint(keys.FEE_DISTRIBUTOR_CHAINLINK_FACTOR);
    const feesForChainlink = totalWntBalance.mul(chainlinkFactor).div(FLOAT_PRECISION);
    let feesForTreasury = totalWntBalance.sub(feesForChainlink);
    const remainingSecondaryFeeToken = totalWntBalance.sub(feesForKeepers).sub(feesForChainlink).sub(feesForTreasury);
    feesForTreasury = feesForTreasury.add(remainingSecondaryFeeToken);
    const feeAmountGmx = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdB));
    const gmxBalancePostDistribute = await gmx.balanceOf(mockRewardDistributor.address);
    const gmxFeesDistributed = gmxBalancePostDistribute.sub(gmxBalancePreDistribute);

    expect(distributionState).to.eq(0);
    expect(lastDistributionTime).to.eq(0);

    expect(keeper1Balance).to.eq(keeperCosts[0]);
    expect(keeper2Balance).to.eq(keeperCosts[1]);
    expect(keeper3Balance).gte(keeperCosts[2]);

    expect(distributeEventData.feesForKeepers).to.eq(feesForKeepers);
    expect(distributeEventData.feesForChainlink).to.eq(feesForChainlink);
    expect(distributeEventData.feesForTreasury).to.eq(feesForTreasury);
    expect(distributeEventData.feeAmountGmx).to.eq(feeAmountGmx);

    expect(gmxFeesDistributed).to.eq(0);
  });

  it("FEE_DISTRIBUTOR_DISTRIBUTE_FEES = false and FEE_RECEIVER != FeeDistributorVault", async function () {
    await config.setBool(keys.FEE_DISTRIBUTOR_DISTRIBUTE_FEES, "0x", false);

    const feeWithdrawer = await deployContract("MockFeeWithdrawer", [feeDistributorVault.address]);

    feeDistributor = await deployContract(
      "FeeDistributor",
      [
        roleStore.address,
        feeDistributorVault.address,
        feeWithdrawer.address,
        dataStore.address,
        eventEmitter.address,
        multichainReader.address,
        gmx.address,
        wnt.address,
      ],
      {
        libraries: {
          "contracts/fee/FeeDistributorUtils.sol:FeeDistributorUtils": feeDistributorUtils.address,
        },
      }
    );

    await grantRole(roleStore, feeDistributor.address, "CONTROLLER");
    await grantRole(roleStore, wallet.address, "FEE_KEEPER");

    await config.setBool(
      keys.MULTICHAIN_AUTHORIZED_ORIGINATORS,
      encodeData(["address"], [feeDistributor.address]),
      "true"
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdA, keys.FEE_RECEIVER]),
      user7.address
    );
    await dataStore.setAddress(keys.FEE_RECEIVER, feeWithdrawer.address);
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdC, keys.FEE_RECEIVER]),
      user8.address
    );

    await feeHandler.withdrawFees(wnt.address);
    await feeWithdrawer.setWithdrawableAmount(wnt.address, expandDecimals(1_000, 18));

    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);
    expect(distributionState).to.eq(0);

    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    await mockLzReadResponseChainA.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockRewardTracker.setTotalSupply(expandDecimals(6_000_000, 18));
    await mockLzReadResponseChainC.setTotalSupply(expandDecimals(3_000_000, 18));

    await mockLzReadResponseChainA.setWithdrawableAmount(gmxA.address, expandDecimals(10_000, 18));
    await mockLzReadResponseChainC.setWithdrawableAmount(gmxC.address, expandDecimals(20_000, 18));
    await dataStore.setUint(keys.withdrawableBuybackTokenAmountKey(gmx.address), expandDecimals(40_000, 18));
    await gmx.mint(feeVault.address, expandDecimals(40_000, 18));
    await feeHandler.withdrawFees(gmx.address);
    await feeWithdrawer.setWithdrawableAmount(gmx.address, expandDecimals(40_000, 18));

    await gmx.mint(wallet.address, expandDecimals(200_000, 18));
    await gmx.approve(mockGmxAdapterB.address, expandDecimals(80_000, 18));
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

    sendParam = {
      dstEid: eidA,
      to: addressToBytes32(user7.address),
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
      dstEid: eidC,
      to: addressToBytes32(user8.address),
      amountLD: expandDecimals(20_000, 18),
      minAmountLD: expandDecimals(20_000, 18),
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

    const feeReceiverAmountBeforeBridgingA = await gmxA.balanceOf(user0.address);
    const feeReceiverAmountBeforeBridgingB = await gmx.balanceOf(feeDistributorVault.address);
    const feeReceiverAmountBeforeBridgingC = await gmxC.balanceOf(user1.address);

    await commitSnapshots();
    const tx = await feeDistributor.initiateDistribute();
    const receipt = await tx.wait();
    const block = await hre.ethers.provider.getBlock(receipt.blockNumber);
    const timestamp = block.timestamp;

    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);

    const readResponseTimestamp = await dataStore.getUint(keys.FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP);

    const feeDistributionInitiatedEventData = parseLogs(fixture, receipt)[4].parsedEventData;
    const feeDistributionDataReceivedEventData = parseLogs(fixture, receipt)[1].parsedEventData;

    const feeAmountGmxA = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdA));
    const feeAmountGmxB = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdB));
    const feeAmountGmxC = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdC));
    const totalFeeAmountGmx = await dataStore.getUint(keys.FEE_DISTRIBUTOR_TOTAL_FEE_AMOUNT_GMX);

    const stakedGmxA = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainIdA));
    const stakedGmxB = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainIdB));
    const stakedGmxC = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainIdC));
    const totalStakedGmx = await dataStore.getUint(keys.FEE_DISTRIBUTOR_TOTAL_STAKED_GMX);

    const feeReceiverAmountAfterBridgingA = await gmxA.balanceOf(user0.address);
    const feeReceiverAmountAfterBridgingB = await gmx.balanceOf(feeDistributorVault.address);
    const feeReceiverAmountAfterBridgingC = await gmxC.balanceOf(user1.address);

    expect(distributionState).to.eq(3);

    expect(readResponseTimestamp).to.equal(timestamp);

    expect(feeDistributionInitiatedEventData.numberOfChainsReadRequests).to.equal(2);
    expect(feeDistributionDataReceivedEventData.totalGmxBridgedOut).to.equal(expandDecimals(0, 18));

    expect(feeAmountGmxA).to.equal(expandDecimals(50_000, 18));
    expect(feeAmountGmxB).to.equal(expandDecimals(160_000, 18));
    expect(feeAmountGmxC).to.equal(expandDecimals(30_000, 18));
    expect(totalFeeAmountGmx).to.equal(expandDecimals(240_000, 18));

    expect(stakedGmxA).to.equal(expandDecimals(3_000_000, 18));
    expect(stakedGmxB).to.equal(expandDecimals(6_000_000, 18));
    expect(stakedGmxC).to.equal(expandDecimals(3_000_000, 18));
    expect(totalStakedGmx).to.equal(expandDecimals(12_000_000, 18));

    expect(feeReceiverAmountBeforeBridgingA).to.equal(expandDecimals(40_000, 18));
    expect(feeReceiverAmountBeforeBridgingB).to.equal(expandDecimals(120_000, 18));
    expect(feeReceiverAmountBeforeBridgingC).to.equal(expandDecimals(10_000, 18));

    expect(feeReceiverAmountAfterBridgingA).to.equal(expandDecimals(40_000, 18));
    expect(feeReceiverAmountAfterBridgingB).to.equal(expandDecimals(160_000, 18));
    expect(feeReceiverAmountAfterBridgingC).to.equal(expandDecimals(10_000, 18));

    const keeper1BalancePreDistribute = await hre.ethers.provider.getBalance(user2.address);
    const keeper2BalancePreDistribute = await hre.ethers.provider.getBalance(user3.address);
    const totalWntBalance = await wnt.balanceOf(feeWithdrawer.address);
    const gmxBalancePreDistribute = await gmx.balanceOf(mockRewardDistributor.address);

    const distributeTx = await feeDistributor.distribute();
    const distributeReceipt = await distributeTx.wait();
    const distributeEventData = parseLogs(fixture, distributeReceipt)[6].parsedEventData;
    const lastDistributionTime = await mockRewardDistributor.lastDistributionTime();

    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);

    const keeperCosts = await dataStore.getUintArray(keys.FEE_DISTRIBUTOR_KEEPER_COSTS);

    const keeper1Balance = await hre.ethers.provider.getBalance(user2.address);
    const keeper2Balance = await hre.ethers.provider.getBalance(user3.address);
    const keeper3Balance = await hre.ethers.provider.getBalance(user4.address);

    const sentToKeeper1 = keeperCosts[0].sub(keeper1BalancePreDistribute);
    const sentToKeeper2 = keeperCosts[1].sub(keeper2BalancePreDistribute);
    const feesForKeepers = sentToKeeper1.add(sentToKeeper2);
    const chainlinkFactor = await dataStore.getUint(keys.FEE_DISTRIBUTOR_CHAINLINK_FACTOR);
    const feesForChainlink = totalWntBalance.mul(chainlinkFactor).div(FLOAT_PRECISION);
    let feesForTreasury = totalWntBalance.sub(feesForChainlink);
    const remainingSecondaryFeeToken = totalWntBalance.sub(feesForKeepers).sub(feesForChainlink).sub(feesForTreasury);
    feesForTreasury = feesForTreasury.add(remainingSecondaryFeeToken);
    const feeAmountGmx = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdB));
    const gmxBalancePostDistribute = await gmx.balanceOf(mockRewardDistributor.address);
    const gmxFeesDistributed = gmxBalancePostDistribute.sub(gmxBalancePreDistribute);

    expect(distributionState).to.eq(0);
    expect(lastDistributionTime).to.eq(0);

    expect(keeper1Balance).to.eq(keeperCosts[0]);
    expect(keeper2Balance).to.eq(keeperCosts[1]);
    expect(keeper3Balance).gte(keeperCosts[2]);

    expect(distributeEventData.feesForKeepers).to.eq(feesForKeepers);
    expect(distributeEventData.feesForChainlink).to.eq(feesForChainlink);
    expect(distributeEventData.feesForTreasury).to.eq(feesForTreasury);
    expect(distributeEventData.feeAmountGmx).to.eq(feeAmountGmx);

    expect(gmxFeesDistributed).to.eq(0);
  });

  it("WNT for keeper costs shortfall covered by WNT from treasury", async () => {
    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    await mockLzReadResponseChainA.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockRewardTracker.setTotalSupply(expandDecimals(6_000_000, 18));
    await mockLzReadResponseChainC.setTotalSupply(expandDecimals(3_000_000, 18));

    await mockLzReadResponseChainA.setWithdrawableAmount(gmxA.address, expandDecimals(10_000, 18));
    await mockLzReadResponseChainC.setWithdrawableAmount(gmxC.address, expandDecimals(20_000, 18));
    await dataStore.setUint(keys.withdrawableBuybackTokenAmountKey(gmx.address), expandDecimals(40_000, 18));
    await gmx.mint(feeVault.address, expandDecimals(40_000, 18));

    await gmx.mint(wallet.address, expandDecimals(170_000, 18));
    await gmx.transfer(feeDistributorVault.address, expandDecimals(120_000, 18));

    await wnt.burn(feeVault.address, await wnt.balanceOf(feeVault.address));
    await wnt.mint(feeVault.address, expandDecimals(1, 17));
    await dataStore.setUint(keys.withdrawableBuybackTokenAmountKey(wnt.address), expandDecimals(1, 17));

    await wallet.sendTransaction({
      to: feeDistributor.address,
      value: expandDecimals(1, 18),
    });

    await dataStore.setUintArray(keys.FEE_DISTRIBUTOR_KEEPER_COSTS, [
      expandDecimals(3, 15),
      expandDecimals(9, 16),
      expandDecimals(4, 15),
    ]);

    await commitSnapshots();
    await feeDistributor.initiateDistribute();

    const keeperCosts = await dataStore.getUintArray(keys.FEE_DISTRIBUTOR_KEEPER_COSTS);

    const keeper1BalancePreDistribute = await hre.ethers.provider.getBalance(user2.address);
    const keeper2BalancePreDistribute = await hre.ethers.provider.getBalance(user3.address);

    const sentToKeeper1 = keeperCosts[0].sub(keeper1BalancePreDistribute);
    const sentToKeeper2 = keeperCosts[1].sub(keeper2BalancePreDistribute);
    const feesForKeepers = sentToKeeper1.add(sentToKeeper2);

    const totalWntBalance = await wnt.balanceOf(feeVault.address);

    const chainlinkFactor = await dataStore.getUint(keys.FEE_DISTRIBUTOR_CHAINLINK_FACTOR);
    const feesForChainlink = totalWntBalance.mul(chainlinkFactor).div(FLOAT_PRECISION);
    const feesForTreasuryPre = totalWntBalance.sub(feesForChainlink);

    const remainingFeesBeforeV1KeeperCosts = totalWntBalance.sub(feesForChainlink).sub(feesForTreasuryPre);

    const additionalFeesFromTreasury = feesForKeepers.sub(remainingFeesBeforeV1KeeperCosts).sub(feesForTreasuryPre);

    const maxFeesFromTreasury = dataStore.getUint(keys.FEE_DISTRIBUTOR_MAX_FEE_AMOUNT_FROM_TREASURY);

    const feeAmountGmx = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdB));

    await expect(feeDistributor.distribute()).to.be.revertedWithCustomError(
      errorsContract,
      "MaxFeesFromTreasuryExceeded",
      // @ts-expect-error: types don't reflect 3rd and 4th argument support
      maxFeesFromTreasury,
      additionalFeesFromTreasury
    );

    await config.setUint(keys.FEE_DISTRIBUTOR_MAX_FEE_AMOUNT_FROM_TREASURY, "0x", expandDecimals(1, 16));

    const treasuryBalancePre = await wnt.balanceOf(user6.address);

    const distributeTx = await feeDistributor.distribute();
    const distributeReceipt = await distributeTx.wait();
    const distributeEventData = parseLogs(fixture, distributeReceipt)[7].parsedEventData;

    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);

    const treasuryBalanceAfter = await wnt.balanceOf(user6.address);
    const sentFromTreasury = treasuryBalancePre.sub(treasuryBalanceAfter);

    expect(sentFromTreasury).is.greaterThan(0);
    expect(sentFromTreasury).to.equal(additionalFeesFromTreasury);

    const feesForTreasury = 0;

    const keeper1Balance = await hre.ethers.provider.getBalance(user2.address);
    const keeper2Balance = await hre.ethers.provider.getBalance(user3.address);
    const keeper3Balance = await hre.ethers.provider.getBalance(user4.address);

    expect(distributionState).to.eq(0);

    expect(keeper1Balance).to.eq(keeperCosts[0]);
    expect(keeper2Balance).to.eq(keeperCosts[1]);
    expect(keeper3Balance).gte(keeperCosts[2]);

    expect(distributeEventData.feesForKeepers).to.eq(feesForKeepers);
    expect(distributeEventData.feesForChainlink).to.eq(feesForChainlink);
    expect(distributeEventData.feesForTreasury).to.eq(feesForTreasury);
    expect(distributeEventData.feeAmountGmx).to.eq(feeAmountGmx);
  });

  it("initiateDistribute() and processLzReceive() with 2 surplus and 2 deficit chains", async () => {
    const chainIdD = 40000;

    // a local list is used so the describe-scope chainIds, which the beforeEach writes to the
    // DataStore for every test, is not left mutated for tests that run after this one
    const fourChainIds = [chainIdA, chainIdB, chainIdC, chainIdD];
    const chainIdsD = [chainIdA, chainIdC, chainIdD, chainIdB];

    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);
    expect(distributionState).to.eq(0);

    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    const dataStoreD = await deployContract("DataStore", [roleStore.address]);
    const configD = await deployContract(
      "Config",
      [roleStore.address, dataStoreD.address, eventEmitter.address, oracle.address, staticOracleProvider.address],
      {
        libraries: {
          "contracts/market/MarketStoreUtils.sol:MarketStoreUtils": marketStoreUtils.address,
          "contracts/market/MarketUtils.sol:MarketUtils": marketUtils.address,
          "contracts/config/ConfigKeys.sol:ConfigKeys": configKeys.address,
          "contracts/config/ConfigUtils.sol:ConfigUtils": configUtils.address,
        },
      }
    );
    const mockEndpointV2DMultichain = await deployContract("MockEndpointV2", [eidD]);
    const mockEndpointV2D = await deployContract("MockEndpointV2", [eidD]);
    const gmxD = await deployContract("MintableToken", ["GMX", "GMX", 18]);
    const mockGmxAdapterD = await deployContract("MockGMX_MintBurnAdapter", [
      [
        { dstEid: eidA, limit: expandDecimals(1000000, 18), window: 60 },
        { dstEid: eidB, limit: expandDecimals(1000000, 18), window: 60 },
        { dstEid: eidC, limit: expandDecimals(1000000, 18), window: 60 },
      ],
      gmxD.address,
      mockEndpointV2D.address,
      wallet.address,
    ]);
    const feeVaultD = await deployContract("FeeVault", [roleStore.address, dataStoreD.address]);
    const feeHandlerD = await deployContract(
      "FeeHandler",
      [
        roleStore.address,
        oracle.address,
        dataStoreD.address,
        eventEmitter.address,
        feeVaultD.address,
        mockVaultV1.address,
        gmxD.address,
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

    const mockVars = [dataStore.address, gmx.address];
    const mockFeeDistributor = await deployContract(
      "MockFeeDistributor",
      [
        roleStore.address,
        feeDistributorVaultD.address,
        feeHandlerD.address,
        dataStoreD.address,
        eventEmitter.address,
        multichainReaderD.address,
        gmxD.address,
        wnt.address,
        mockVars,
      ],
      {
        libraries: {
          "contracts/fee/FeeDistributorUtils.sol:FeeDistributorUtils": feeDistributorUtils.address,
        },
      }
    );

    const mockRewardDistributorD = await deployContract("MockRewardDistributorV1", [gmxD.address]);
    const mockRewardTrackerD = await deployContract("MockRewardTrackerV1", [mockRewardDistributorD.address]);
    await mockRewardDistributorD.setRewardTracker(mockRewardTrackerD.address);

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
    await dataStore.setUintArray(keys.FEE_DISTRIBUTOR_CHAIN_ID, fourChainIds);
    await config.setUint(keys.FEE_DISTRIBUTOR_LAYERZERO_CHAIN_ID, encodeData(["uint256"], [chainIdD]), eidD);
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdD, feeDistributorConfig.gmxKey]),
      gmxD.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdD, feeDistributorConfig.rewardTrackerKey]),
      mockRewardTrackerD.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdD, feeDistributorConfig.dataStoreKey]),
      dataStoreD.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdD, feeDistributorConfig.feeWithdrawerKey]),
      feeHandlerD.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdD, feeDistributorConfig.feeDistributorVaultKey]),
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
    const initialBlock = await hre.ethers.provider.getBlock("latest");
    initialTimestamp = initialBlock.timestamp;
    await dataStore.setUint(keys.FEE_DISTRIBUTOR_DISTRIBUTION_TIMESTAMP, initialTimestamp);
    await dataStoreD.setUint(keys.FEE_DISTRIBUTOR_DISTRIBUTION_TIMESTAMP, initialTimestamp);

    await configD.setBool(keys.FEE_DISTRIBUTOR_DISTRIBUTE_FEES, "0x", true);
    await configD.setUint(keys.FEE_DISTRIBUTOR_MAX_READ_RESPONSE_DELAY, "0x", 259200);
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
      encodeData(["uint256", "bytes32"], [chainIdA, feeDistributorConfig.rewardTrackerKey]),
      mockLzReadResponseChainA.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdB, feeDistributorConfig.rewardTrackerKey]),
      mockRewardTracker.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdC, feeDistributorConfig.rewardTrackerKey]),
      mockLzReadResponseChainC.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdD, feeDistributorConfig.rewardTrackerKey]),
      mockRewardTrackerD.address
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
      encodeData(["uint256", "bytes32"], [chainIdA, feeDistributorConfig.feeWithdrawerKey]),
      mockLzReadResponseChainA.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdA, feeDistributorConfig.feeDistributorVaultKey]),
      user0.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdB, feeDistributorConfig.feeWithdrawerKey]),
      feeHandler.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdB, feeDistributorConfig.feeDistributorVaultKey]),
      feeDistributorVault.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdC, feeDistributorConfig.feeWithdrawerKey]),
      mockLzReadResponseChainC.address
    );
    await configD.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
      encodeData(["uint256", "bytes32"], [chainIdC, feeDistributorConfig.feeDistributorVaultKey]),
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
    await configD.setUint(keys.FEE_DISTRIBUTOR_MAX_FEE_AMOUNT_FROM_TREASURY, "0x", expandDecimals(1, 16));
    await configD.setUint(keys.FEE_DISTRIBUTOR_CHAINLINK_FACTOR, "0x", expandDecimals(12, 28));
    await configD.setUint(keys.BUYBACK_BATCH_AMOUNT, encodeData(["address"], [gmxD.address]), expandDecimals(5, 17));

    await configD.setUint(keys.BUYBACK_BATCH_AMOUNT, encodeData(["address"], [wnt.address]), expandDecimals(5, 17));
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
    await mockRewardTracker.setTotalSupply(expandDecimals(6_000_000, 18));
    await mockLzReadResponseChainC.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockRewardTrackerD.setTotalSupply(expandDecimals(6_000_000, 18));

    await mockLzReadResponseChainA.setWithdrawableAmount(gmxA.address, expandDecimals(10_000, 18));
    await mockLzReadResponseChainC.setWithdrawableAmount(gmxC.address, expandDecimals(20_000, 18));
    await dataStore.setUint(keys.withdrawableBuybackTokenAmountKey(gmx.address), expandDecimals(40_000, 18));
    await gmx.mint(feeVault.address, expandDecimals(40_000, 18));
    await dataStoreD.setUint(keys.withdrawableBuybackTokenAmountKey(gmxD.address), expandDecimals(50_000, 18));

    await gmx.mint(wallet.address, expandDecimals(290_000, 18));
    await gmx.approve(mockGmxAdapterB.address, expandDecimals(170_000, 18));
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
      to: addressToBytes32(feeVaultD.address),
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

    const feeReceiverAmountBeforeBridgingA = await gmxA.balanceOf(user0.address);
    const feeReceiverAmountBeforeBridgingB = await gmx.balanceOf(feeDistributorVault.address);
    const feeReceiverAmountBeforeBridgingC = await gmxC.balanceOf(user1.address);
    const feeReceiverAmountBeforeBridgingD = await gmxD.balanceOf(feeDistributorVaultD.address);

    await commitSnapshots();
    // chain D's snapshot is committed to dataStoreD and read from there by chain B
    await mockFeeDistributor.commitSnapshot();

    const tx = await feeDistributor.initiateDistribute();
    const receipt = await tx.wait();
    const block = await hre.ethers.provider.getBlock(receipt.blockNumber);
    const timestamp = block.timestamp;

    const txD = await mockFeeDistributor.initiateDistribute();
    const receiptD = await txD.wait();
    const blockD = await hre.ethers.provider.getBlock(receiptD.blockNumber);
    const timestampD = blockD.timestamp;

    distributionState = await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE);
    const distributionStateD = await dataStoreD.getUint(keys.FEE_DISTRIBUTOR_STATE);

    const readResponseTimestamp = await dataStore.getUint(keys.FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP);
    const readResponseTimestampD = await dataStoreD.getUint(keys.FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP);

    const feeDistributionInitiatedEventData = parseLogs(fixture, receipt)[18].parsedEventData;
    const feeDistributionDataReceivedEventData = parseLogs(fixture, receipt)[15].parsedEventData;

    const feeDistributionInitiatedEventDataD = parseLogs(fixture, receiptD)[9].parsedEventData;
    const feeDistributionDataReceivedEventDataD = parseLogs(fixture, receiptD)[6].parsedEventData;

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

    const feeReceiverAmountAfterBridgingA = await gmxA.balanceOf(user0.address);
    const feeReceiverAmountAfterBridgingB = await gmx.balanceOf(feeDistributorVault.address);
    const feeReceiverAmountAfterBridgingC = await gmxC.balanceOf(user1.address);
    const feeReceiverAmountAfterBridgingD = await gmxD.balanceOf(feeDistributorVaultD.address);

    expect(distributionState).to.eq(3);
    expect(distributionStateD).to.eq(3);

    expect(readResponseTimestamp).to.equal(timestamp);
    expect(readResponseTimestampD).to.equal(timestampD);

    expect(feeDistributionInitiatedEventData.numberOfChainsReadRequests).to.equal(3);
    expect(feeDistributionDataReceivedEventData.totalGmxBridgedOut).to.equal(expandDecimals(40_000, 18));
    expect(feeDistributionInitiatedEventDataD.numberOfChainsReadRequests).to.equal(3);
    expect(feeDistributionDataReceivedEventDataD.totalGmxBridgedOut).to.equal(expandDecimals(10_000, 18));

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

    expect(feeReceiverAmountBeforeBridgingA).to.equal(expandDecimals(30_000, 18));
    expect(feeReceiverAmountBeforeBridgingB).to.equal(expandDecimals(120_000, 18));
    expect(feeReceiverAmountBeforeBridgingC).to.equal(expandDecimals(10_000, 18));
    expect(feeReceiverAmountBeforeBridgingD).to.equal(expandDecimals(80_000, 18));

    expect(feeReceiverAmountAfterBridgingA).to.equal(expandDecimals(50_000, 18));
    expect(feeReceiverAmountAfterBridgingB).to.equal(expandDecimals(120_000, 18));
    expect(feeReceiverAmountAfterBridgingC).to.equal(expandDecimals(40_000, 18));
    expect(feeReceiverAmountAfterBridgingD).to.equal(expandDecimals(120_000, 18));
  });

  it("processLzReceive() discards received data and steps back to Committed on a snapshot epoch mismatch", async function () {
    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    await mockLzReadResponseChainA.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockRewardTracker.setTotalSupply(expandDecimals(6_000_000, 18));
    await mockLzReadResponseChainC.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockLzReadResponseChainA.setWithdrawableAmount(gmxA.address, expandDecimals(10_000, 18));
    await dataStore.setUint(keys.withdrawableBuybackTokenAmountKey(gmx.address), expandDecimals(10_000, 18));
    await gmx.mint(feeVault.address, expandDecimals(10_000, 18));
    await wallet.sendTransaction({ to: feeDistributor.address, value: expandDecimals(1, 18) });

    await commitSnapshots();
    // simulate chain C not yet having committed a snapshot for this epoch
    await mockLzReadResponseChainC.setUint(keys.feeDistributorSnapshotEpochKey(chainIdC), 0);

    await feeDistributor.initiateDistribute();

    expect(await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE)).to.eq(4);
    expect(await dataStore.getBytes32(keys.FEE_DISTRIBUTOR_EXPECTED_READ_GUID)).to.eq(ethers.constants.HashZero);
    expect(await dataStore.getUint(keys.FEE_DISTRIBUTOR_TOTAL_FEE_AMOUNT_GMX)).to.eq(0);
    expect(await dataStore.getUint(keys.FEE_DISTRIBUTOR_TOTAL_STAKED_GMX)).to.eq(0);

    await expect(feeDistributor.commitSnapshot()).to.be.revertedWithCustomError(
      errorsContract,
      "SnapshotAlreadyCommitted"
    );

    await feeDistributorConfig.commitRemoteSnapshot({
      mock: mockLzReadResponseChainC,
      gmxToken: gmxC,
      vaultAddress: user1.address,
      chainId: chainIdC,
      distributionDay,
    });

    await feeDistributor.initiateDistribute();
    expect(await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE)).to.eq(3);

    await feeDistributor.distribute();
    expect(await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE)).to.eq(0);
  });

  it("distribution uses committed snapshot values even if stake and fees move after the commits", async function () {
    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    await mockLzReadResponseChainA.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockRewardTracker.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockLzReadResponseChainC.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockLzReadResponseChainA.setWithdrawableAmount(gmxA.address, expandDecimals(10_000, 18));
    await mockLzReadResponseChainC.setWithdrawableAmount(gmxC.address, expandDecimals(10_000, 18));
    await dataStore.setUint(keys.withdrawableBuybackTokenAmountKey(gmx.address), expandDecimals(10_000, 18));
    await gmx.mint(feeVault.address, expandDecimals(10_000, 18));
    await wallet.sendTransaction({ to: feeDistributor.address, value: expandDecimals(1, 18) });

    await commitSnapshots();

    // simulate stake and fees moving between chains after the commits but before the read
    await mockLzReadResponseChainA.setTotalSupply(expandDecimals(9_000_000, 18));
    await mockRewardTracker.setTotalSupply(expandDecimals(1_000_000, 18));
    await mockLzReadResponseChainA.setWithdrawableAmount(gmxA.address, expandDecimals(999_999, 18));

    await feeDistributor.initiateDistribute();

    expect(await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdA))).to.eq(expandDecimals(10_000, 18));
    expect(await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdB))).to.eq(expandDecimals(10_000, 18));
    expect(await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdC))).to.eq(expandDecimals(10_000, 18));
    expect(await dataStore.getUint(keys.FEE_DISTRIBUTOR_TOTAL_FEE_AMOUNT_GMX)).to.eq(expandDecimals(30_000, 18));

    expect(await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainIdA))).to.eq(expandDecimals(3_000_000, 18));
    expect(await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainIdB))).to.eq(expandDecimals(3_000_000, 18));
    expect(await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainIdC))).to.eq(expandDecimals(3_000_000, 18));
    expect(await dataStore.getUint(keys.FEE_DISTRIBUTOR_TOTAL_STAKED_GMX)).to.eq(expandDecimals(9_000_000, 18));

    expect(await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE)).to.eq(3);
    await feeDistributor.distribute();
    expect(await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE)).to.eq(0);
  });

  it("a distribution committed at the end of a week can complete just after the week boundary", async function () {
    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    await mockLzReadResponseChainA.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockRewardTracker.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockLzReadResponseChainC.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockLzReadResponseChainA.setWithdrawableAmount(gmxA.address, expandDecimals(10_000, 18));
    await mockLzReadResponseChainC.setWithdrawableAmount(gmxC.address, expandDecimals(10_000, 18));
    await dataStore.setUint(keys.withdrawableBuybackTokenAmountKey(gmx.address), expandDecimals(10_000, 18));
    await gmx.mint(feeVault.address, expandDecimals(10_000, 18));
    await wallet.sendTransaction({ to: feeDistributor.address, value: expandDecimals(1, 18) });

    // commit near the end of the current distribution week, then cross the boundary before the
    // read executes; the epoch validation compares against the stored committed epoch
    await feeDistributorConfig.moveToEndOfCurrentDistributionWeek(distributionDay);
    await commitSnapshots();

    await hre.ethers.provider.send("evm_increaseTime", [300]);
    await hre.ethers.provider.send("evm_mine", []);

    await feeDistributor.initiateDistribute();
    expect(await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE)).to.eq(3);

    await feeDistributor.distribute();
    expect(await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE)).to.eq(0);
  });

  it("processLzReceive() rejects a response with an unexpected guid", async function () {
    await grantRole(roleStore, wallet.address, "MULTICHAIN_READER");

    await dataStore.setUint(keys.FEE_DISTRIBUTOR_STATE, 1);

    const block = await hre.ethers.provider.getBlock("latest");
    await expect(
      feeDistributor.processLzReceive(ethers.utils.formatBytes32String("bogus"), {
        timestamp: block.timestamp,
        readData: "0x",
      })
    ).to.be.revertedWithCustomError(errorsContract, "UnexpectedReadResponseGuid");
  });

  it("processLzReceive() discards a response for a changed chain id list and rejects one of unexpected length", async function () {
    await grantRole(roleStore, wallet.address, "MULTICHAIN_READER");

    const guid = ethers.utils.formatBytes32String("guid");
    await dataStore.setUint(keys.FEE_DISTRIBUTOR_STATE, 1);
    await dataStore.setBytes32(keys.FEE_DISTRIBUTOR_EXPECTED_READ_GUID, guid);

    // a changed chain id list steps back gracefully regardless of the response size
    await dataStore.setBytes32(keys.FEE_DISTRIBUTOR_EXPECTED_CHAIN_IDS_HASH, ethers.utils.formatBytes32String("x"));
    let block = await hre.ethers.provider.getBlock("latest");
    await feeDistributor.processLzReceive(guid, { timestamp: block.timestamp, readData: "0x" });
    expect(await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE)).to.eq(4);
    expect(await dataStore.getBytes32(keys.FEE_DISTRIBUTOR_EXPECTED_READ_GUID)).to.eq(ethers.constants.HashZero);

    // with an unchanged list, a response of the wrong size reverts rather than decoding misaligned
    const chainIdsHash = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(["uint256[]"], [[chainIdA, chainIdC, chainIdB].sort((a, b) => a - b)])
    );
    await dataStore.setUint(keys.FEE_DISTRIBUTOR_STATE, 1);
    await dataStore.setBytes32(keys.FEE_DISTRIBUTOR_EXPECTED_READ_GUID, guid);
    await dataStore.setBytes32(keys.FEE_DISTRIBUTOR_EXPECTED_CHAIN_IDS_HASH, chainIdsHash);
    block = await hre.ethers.provider.getBlock("latest");
    await expect(
      feeDistributor.processLzReceive(guid, { timestamp: block.timestamp, readData: "0x" })
    ).to.be.revertedWithCustomError(errorsContract, "InvalidReadDataLength");
  });

  it("initiateDistribute() rejects a snapshot committed too long before", async function () {
    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    await mockLzReadResponseChainA.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockRewardTracker.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockLzReadResponseChainC.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockLzReadResponseChainA.setWithdrawableAmount(gmxA.address, expandDecimals(10_000, 18));
    await mockLzReadResponseChainC.setWithdrawableAmount(gmxC.address, expandDecimals(10_000, 18));
    await dataStore.setUint(keys.withdrawableBuybackTokenAmountKey(gmx.address), expandDecimals(10_000, 18));
    await gmx.mint(feeVault.address, expandDecimals(10_000, 18));
    await wallet.sendTransaction({ to: feeDistributor.address, value: expandDecimals(1, 18) });

    await commitSnapshots();

    await hre.ethers.provider.send("evm_increaseTime", [11 * 24 * 60 * 60]);
    await hre.ethers.provider.send("evm_mine", []);

    await expect(feeDistributor.initiateDistribute()).to.be.revertedWithCustomError(
      errorsContract,
      "StaleSnapshotEpoch"
    );

    // a fresh commit for the current epoch recovers
    await commitSnapshots();
    await feeDistributor.initiateDistribute();
    expect(await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE)).to.eq(3);

    await feeDistributor.distribute();
    expect(await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE)).to.eq(0);
  });

  it("bridgedGmxReceived() handles the vault balance dropping below the committed amount", async function () {
    await grantRole(roleStore, wallet.address, "TIMELOCK_ADMIN");
    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    await mockLzReadResponseChainA.setTotalSupply(expandDecimals(6_000_000, 18));
    await mockRewardTracker.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockLzReadResponseChainC.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockLzReadResponseChainA.setWithdrawableAmount(gmxA.address, expandDecimals(160_000, 18));
    await mockLzReadResponseChainC.setWithdrawableAmount(gmxC.address, expandDecimals(30_000, 18));
    await dataStore.setUint(keys.withdrawableBuybackTokenAmountKey(gmx.address), expandDecimals(50_000, 18));
    await gmx.mint(feeVault.address, expandDecimals(50_000, 18));
    await wallet.sendTransaction({ to: feeDistributor.address, value: expandDecimals(1, 18) });

    await commitSnapshots();
    await feeDistributor.initiateDistribute();
    expect(await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE)).to.eq(2);

    await config.setUint(keys.FEE_DISTRIBUTOR_BRIDGE_GRACE_PERIOD, "0x", 3600);
    await config.setUint(keys.FEE_DISTRIBUTOR_MIN_BRIDGED_FACTOR, "0x", expandDecimals(3, 29)); // 30%

    await hre.ethers.provider.send("evm_increaseTime", [3700]);
    await hre.ethers.provider.send("evm_mine", []);

    await feeDistributorVault.withdrawToken(gmx.address, user8.address, expandDecimals(30_000, 18));

    await feeDistributor.bridgedGmxReceived();
    expect(await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE)).to.eq(3);
    expect(await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdB))).to.eq(expandDecimals(20_000, 18));

    await feeDistributor.distribute();
    expect(await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE)).to.eq(0);
  });

  it("bridgedGmxReceived() tolerates a bridged shortfall only after the grace period and above the floor", async function () {
    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    await mockLzReadResponseChainA.setTotalSupply(expandDecimals(6_000_000, 18));
    await mockRewardTracker.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockLzReadResponseChainC.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockLzReadResponseChainA.setWithdrawableAmount(gmxA.address, expandDecimals(160_000, 18));
    await mockLzReadResponseChainC.setWithdrawableAmount(gmxC.address, expandDecimals(30_000, 18));
    await dataStore.setUint(keys.withdrawableBuybackTokenAmountKey(gmx.address), expandDecimals(50_000, 18));
    await gmx.mint(feeVault.address, expandDecimals(50_000, 18));
    await wallet.sendTransaction({ to: feeDistributor.address, value: expandDecimals(1, 18) });

    await commitSnapshots();
    await feeDistributor.initiateDistribute();
    expect(await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE)).to.eq(2);

    await expect(feeDistributor.bridgedGmxReceived()).to.be.revertedWithCustomError(
      errorsContract,
      "BridgedAmountNotSufficient"
    );

    await config.setUint(keys.FEE_DISTRIBUTOR_BRIDGE_GRACE_PERIOD, "0x", 3600);
    await config.setUint(keys.FEE_DISTRIBUTOR_MIN_BRIDGED_FACTOR, "0x", expandDecimals(5, 29)); // 50%

    await expect(feeDistributor.bridgedGmxReceived()).to.be.revertedWithCustomError(
      errorsContract,
      "BridgedAmountNotSufficient"
    );

    await hre.ethers.provider.send("evm_increaseTime", [3700]);
    await hre.ethers.provider.send("evm_mine", []);

    await config.setUint(keys.FEE_DISTRIBUTOR_MIN_BRIDGED_FACTOR, "0x", expandDecimals(999, 27)); // 99.9%
    await expect(feeDistributor.bridgedGmxReceived()).to.be.revertedWithCustomError(
      errorsContract,
      "BridgedAmountNotSufficient"
    );

    await config.setUint(keys.FEE_DISTRIBUTOR_MIN_BRIDGED_FACTOR, "0x", expandDecimals(5, 29));
    await feeDistributor.bridgedGmxReceived();
    expect(await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE)).to.eq(3);
    expect(await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainIdB))).to.eq(expandDecimals(50_000, 18));

    await feeDistributor.distribute();
    expect(await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE)).to.eq(0);
  });

  it("resetDistribution() abandons a stuck distribution and blocks re-initiation until the next week", async function () {
    await grantRole(roleStore, wallet.address, "TIMELOCK_ADMIN");
    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

    await mockLzReadResponseChainA.setTotalSupply(expandDecimals(6_000_000, 18));
    await mockRewardTracker.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockLzReadResponseChainC.setTotalSupply(expandDecimals(3_000_000, 18));
    await mockLzReadResponseChainA.setWithdrawableAmount(gmxA.address, expandDecimals(160_000, 18));
    await mockLzReadResponseChainC.setWithdrawableAmount(gmxC.address, expandDecimals(30_000, 18));
    await dataStore.setUint(keys.withdrawableBuybackTokenAmountKey(gmx.address), expandDecimals(50_000, 18));
    await gmx.mint(feeVault.address, expandDecimals(50_000, 18));
    await wallet.sendTransaction({ to: feeDistributor.address, value: expandDecimals(1, 18) });

    await commitSnapshots();
    await feeDistributor.initiateDistribute();
    expect(await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE)).to.eq(2);

    await expect(feeDistributor.connect(user0).resetDistribution()).to.be.revertedWithCustomError(
      errorsContract,
      "Unauthorized",
      // @ts-expect-error: types don't reflect 3rd argument support
      "TIMELOCK_ADMIN"
    );

    await expect(feeDistributor.resetDistribution()).to.be.revertedWithCustomError(
      errorsContract,
      "DistributionResetNotAllowed"
    );

    await hre.ethers.provider.send("evm_increaseTime", [259200 + 60]);
    await hre.ethers.provider.send("evm_mine", []);

    await feeDistributor.resetDistribution();
    expect(await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE)).to.eq(0);
    expect(await dataStore.getUint(keys.feeDistributorSnapshotEpochKey(chainIdB))).to.eq(0);

    await expect(feeDistributor.resetDistribution()).to.be.revertedWithCustomError(
      errorsContract,
      "InvalidDistributionState"
    );

    await expect(feeDistributor.commitSnapshot()).to.be.revertedWithCustomError(
      errorsContract,
      "FeeDistributionAlreadyCompleted"
    );

    await feeDistributorConfig.moveToNextDistributionDay(distributionDay);
    await feeDistributor.commitSnapshot();
    expect(await dataStore.getUint(keys.FEE_DISTRIBUTOR_STATE)).to.eq(4);
  });
});
