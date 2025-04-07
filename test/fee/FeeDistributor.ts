import { expect } from "chai";
import { grantRole } from "../../utils/role";
import { expandDecimals } from "../../utils/math";
import { deployFixture } from "../../utils/fixture";
import { encodeData } from "../../utils/hash";
import { deployContract } from "../../utils/deploy";
import * as keys from "../../utils/keys";
import * as feeDistKeys from "../../utils/feeDistributor";

describe("FeeDistributor", function () {
  let fixture,
    feeDistributor,
    feeDistributorVault,
    multichainReader,
    mockEndpointV2,
    dataStore,
    config,
    gmx,
    wnt,
    roleStore,
    feeHandler,
    chainlinkPriceFeedProvider,
    wethPriceFeed,
    gmxPriceFeed,
    wallet,
    user0,
    user1,
    user2,
    user3,
    user4;

  // Constants representing mock Endpoint IDs for testing purposes
  const eid1 = 1000;
  const eid2 = 2000;
  const eid3 = 3000;

  // Constants representing chain ID for testing purposes
  const chainId1 = 10000;
  const chainId2 = 31337;
  const chainId3 = 20000;
  const chainIds = [chainId1, chainId2, chainId3];

  // Constant representing a channel ID for testing purposes
  const channelId = 1001;

  // Number of confirmations used for test
  const numberOfConfirmations = 1;

  // beforeEach hook for setup that runs before each test in the block
  beforeEach(async function () {
    fixture = await deployFixture();
    ({
      feeDistributor,
      feeDistributorVault,
      multichainReader,
      mockEndpointV2,
      dataStore,
      config,
      gmx,
      wnt,
      roleStore,
      feeHandler,
      chainlinkPriceFeedProvider,
      wethPriceFeed,
      gmxPriceFeed,
    } = fixture.contracts);

    const mockLzReadResponse1 = await deployContract("MockLzReadResponse", []);
    const mockLzReadResponse2 = await deployContract("MockLzReadResponse", []);
    const mockLzReadResponse3 = await deployContract("MockLzReadResponse", []);

    ({ wallet, user0, user1, user2, user3, user4 } = fixture.accounts);

    await grantRole(roleStore, wallet.address, "FEE_DISTRIBUTION_KEEPER");

    // Setting destination endpoint in mockEndpointV2
    await mockEndpointV2.setDestLzEndpoint(multichainReader.address, mockEndpointV2.address);

    // Setting read channel for mockEndpointV2
    await mockEndpointV2.setReadChannelId(channelId);

    const originator = feeDistributor.address;

    // Setting LZRead configuration in dataStore for multichainReader and mockMultichainReaderOriginator
    await config.setBool(keys.MULTICHAIN_AUTHORIZED_ORIGINATORS, encodeData(["address"], [originator]), "true");
    await config.setUint(keys.MULTICHAIN_READ_CHANNEL, "0x", channelId);
    await config.setBytes32(
      keys.MULTICHAIN_PEERS,
      encodeData(["uint256"], [channelId]),
      ethers.utils.hexZeroPad(multichainReader.address, 32)
    );
    await config.setUint(
      keys.MULTICHAIN_AUTHORIZED_ORIGINATORS,
      encodeData(["uint256"], [eid1]),
      numberOfConfirmations
    );
    await config.setUint(
      keys.MULTICHAIN_AUTHORIZED_ORIGINATORS,
      encodeData(["uint256"], [eid2]),
      numberOfConfirmations
    );
    await config.setUint(
      keys.MULTICHAIN_AUTHORIZED_ORIGINATORS,
      encodeData(["uint256"], [eid3]),
      numberOfConfirmations
    );

    await mockLzReadResponse1.setMockSupply(expandDecimals(2000000, 18));
    await mockLzReadResponse2.setMockSupply(expandDecimals(5000000, 18));
    await mockLzReadResponse3.setMockSupply(expandDecimals(3000000, 18));

    await mockLzReadResponse1.setUint(keys.withdrawableBuybackTokenAmountKey(gmx.address), expandDecimals(20000, 18));
    await mockLzReadResponse3.setUint(keys.withdrawableBuybackTokenAmountKey(gmx.address), expandDecimals(30000, 18));

    await gmx.mint(user0.address, expandDecimals(40000, 18));
    await gmx.mint(feeDistributorVault.address, expandDecimals(20000, 18));
    await gmx.mint(user1.address, expandDecimals(10000, 18));

    await gmx.mint(feeHandler.address, expandDecimals(10000, 18));

    // Setting feeDistributor configuration in config and dataStore
    await dataStore.setUint(keys.withdrawableBuybackTokenAmountKey(gmx.address), expandDecimals(10000, 18));
    await config.setUint(keys.FEE_DISTRIBUTOR_DISTRIBUTION_DAY, "0x", 3);
    await config.setUint(keys.FEE_DISTRIBUTOR_REFERRAL_REWARDS_WNT_USD_LIMIT, "0x", 3);
    await config.setUint(keys.FEE_DISTRIBUTOR_MAX_READ_RESPONSE_DELAY, "0x", 600);
    await config.setUint(keys.FEE_DISTRIBUTOR_GAS_LIMIT, "0x", 5000000);
    await dataStore.setUintArray(keys.FEE_DISTRIBUTOR_CHAIN_ID, chainIds);
    await config.setUint(keys.FEE_DISTRIBUTOR_BRIDGE_SLIPPAGE_FACTOR, encodeData(["uint256"], [3]), 3);
    await config.setUint(keys.FEE_DISTRIBUTOR_BRIDGE_SLIPPAGE_AMOUNT, "0x", 4);
    await config.setUint(keys.FEE_DISTRIBUTOR_LAYERZERO_CHAIN_ID, encodeData(["uint256"], [chainId1]), eid1);
    await config.setUint(keys.FEE_DISTRIBUTOR_LAYERZERO_CHAIN_ID, encodeData(["uint256"], [chainId2]), eid2);
    await config.setUint(keys.FEE_DISTRIBUTOR_LAYERZERO_CHAIN_ID, encodeData(["uint256"], [chainId3]), eid3);
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainId1, feeDistKeys.gmxKey]),
      gmx.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainId2, feeDistKeys.gmxKey]),
      gmx.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainId3, feeDistKeys.gmxKey]),
      gmx.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainId1, feeDistKeys.extendedGmxTrackerKey]),
      mockLzReadResponse1.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainId2, feeDistKeys.extendedGmxTrackerKey]),
      mockLzReadResponse2.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainId3, feeDistKeys.extendedGmxTrackerKey]),
      mockLzReadResponse3.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainId1, feeDistKeys.dataStoreKey]),
      mockLzReadResponse1.address
    );
    await config.setAddress(
      keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
      encodeData(["uint256", "bytes32"], [chainId3, feeDistKeys.dataStoreKey]),
      mockLzReadResponse3.address
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
    // await config.setUint(keys.FEE_DISTRIBUTOR_AMOUNT_THRESHOLD, encodeData(["bytes32"], [3]), 5);
    await dataStore.setAddressArray(keys.FEE_DISTRIBUTOR_KEEPER_COSTS, [user2.address, user3.address, user4.address]);
    await dataStore.setUintArray(keys.FEE_DISTRIBUTOR_KEEPER_COSTS, [1, 2, 3]);
    await dataStore.setBoolArray(keys.FEE_DISTRIBUTOR_KEEPER_COSTS, [true, false, true]);
    await config.setUint(keys.FEE_DISTRIBUTOR_KEEPER_GLP_FACTOR, "0x", 6);
    await config.setUint(keys.FEE_DISTRIBUTOR_CHAINLINK_FACTOR, "0x", 7);
    await config.setUint(keys.FEE_DISTRIBUTOR_BRIDGE_ORIGIN_DEADLINE, encodeData(["uint256"], [3]), 8);
    await config.setUint(keys.FEE_DISTRIBUTOR_BRIDGE_DEST_DEADLINE, "0x", 9);
    await config.setUint(keys.BUYBACK_BATCH_AMOUNT, encodeData(["address"], [gmx.address]), expandDecimals(5, 17));
    await dataStore.setAddress(keys.oracleProviderForTokenKey(wnt.address), chainlinkPriceFeedProvider.address);
    await dataStore.setAddress(keys.oracleProviderForTokenKey(gmx.address), chainlinkPriceFeedProvider.address);
  });

  // Validate initiateDistribute() and processLzReceive() functions when current chain has a fee deficit
  it("validate initiateDistribute() and processLzReceive() for fee deficit", async function () {
    await wallet.sendTransaction({
      to: feeDistributor.address,
      value: ethers.utils.parseEther("1.0"),
    });

    // Retreive WETH price
    const wethPrice = await wethPriceFeed.latestAnswer();
    expect(wethPrice).to.eq(expandDecimals(5000, 8));

    // Retreive GMX price
    const gmxPrice = await gmxPriceFeed.latestAnswer();
    expect(gmxPrice).to.eq(expandDecimals(20, 8));

    const tx = await feeDistributor.initiateDistribute();
    const receipt = await tx.wait();
    const block = await ethers.provider.getBlock(receipt.blockNumber);
    const timestamp = block.timestamp;

    // Assert the resulting state of data in mockMultichainReaderOriginator
    const distributeTimestamp = await dataStore.getUint(keys.FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP);

    const feeAmountGmx1 = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainId1));
    const feeAmountGmx2 = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainId2));
    const feeAmountGmx3 = await dataStore.getUint(keys.feeDistributorFeeAmountGmxKey(chainId3));
    const totalFeeAmountGmx = await dataStore.getUint(keys.FEE_DISTRIBUTOR_TOTAL_FEE_AMOUNT_GMX);

    const stakedGmx1 = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainId1));
    const stakedGmx2 = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainId2));
    const stakedGmx3 = await dataStore.getUint(keys.feeDistributorStakedGmxKey(chainId3));
    const totalStakedGmx = await dataStore.getUint(keys.FEE_DISTRIBUTOR_TOTAL_STAKED_GMX);

    expect(distributeTimestamp).to.equal(encodeData(["uint256"], [timestamp]));

    expect(feeAmountGmx1).to.equal(encodeData(["uint256"], [expandDecimals(60000, 18)]));
    expect(feeAmountGmx2).to.equal(encodeData(["uint256"], [expandDecimals(30000, 18)]));
    expect(feeAmountGmx3).to.equal(encodeData(["uint256"], [expandDecimals(40000, 18)]));
    expect(totalFeeAmountGmx).to.equal(encodeData(["uint256"], [expandDecimals(130000, 18)]));

    expect(stakedGmx1).to.equal(encodeData(["uint256"], [expandDecimals(2000000, 18)]));
    expect(stakedGmx2).to.equal(encodeData(["uint256"], [expandDecimals(5000000, 18)]));
    expect(stakedGmx3).to.equal(encodeData(["uint256"], [expandDecimals(3000000, 18)]));
    expect(totalStakedGmx).to.equal(encodeData(["uint256"], [expandDecimals(10000000, 18)]));
  });
});
