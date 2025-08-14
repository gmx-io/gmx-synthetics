import { Options } from "@layerzerolabs/lz-v2-utilities";
import { addressToBytes32 } from "@layerzerolabs/lz-v2-utilities";
import { expandDecimals } from "../utils/math";
import { encodeData } from "../utils/hash";
import { deployContract } from "../utils/deploy";
import { grantRole } from "../utils/role";
import * as feeDistributorConfig from "../utils/feeDistributor";
import * as keys from "../utils/keys";

async function main() {
  const options = Options.newOptions().addExecutorLzReceiveOption(65000, 0).toHex().toString();
  const eidA = 1000,
    eidB = 2000,
    eidC = 3000;
  const chainIdA = 10000,
    chainIdB = 31337,
    chainIdC = 20000;
  const chainIds = [chainIdA, chainIdB, chainIdC];
  const channelId = 1001;
  const numberOfConfirmations = 1;
  const distributionDay = 3;

  const snap = await ethers.provider.send("evm_snapshot", []);
  console.log(snap);

  const accounts = await ethers.getSigners();

  const feeDistributor = await ethers.getContract("FeeDistributor");
  const feeDistributorVault = await ethers.getContract("FeeDistributorVault");
  const multichainReader = await ethers.getContract("MultichainReader");
  const mockEndpointV2 = await ethers.getContract("MockEndpointV2");
  const dataStore = await ethers.getContract("DataStore");
  const config = await ethers.getContract("Config");
  const wnt = await ethers.getContract("WETH");
  const gmx = await ethers.getContract("GMX");
  const roleStore = await ethers.getContract("RoleStore");
  const feeHandler = await ethers.getContract("FeeHandler");
  const chainlinkPriceFeedProvider = await ethers.getContract("ChainlinkPriceFeedProvider");
  const oracle = await ethers.getContract("Oracle");

  const mockExtendedGmxDistributor = await deployContract("MockRewardDistributorV1", []);
  const mockFeeGlpDistributor = await deployContract("MockRewardDistributorV1", []);
  const mockLzReadResponseChain1 = await deployContract("MockLzReadResponse", []);
  const mockExtendedGmxTracker = await deployContract("MockRewardTrackerV1", [mockExtendedGmxDistributor.address]);
  const mockLzReadResponseChain3 = await deployContract("MockLzReadResponse", []);
  const mockFeeGlpTracker = await deployContract("MockRewardTrackerV1", [mockFeeGlpDistributor.address]);
  const mockVester = await deployContract("MockVesterV1", [
    [accounts[6].address, accounts[7].address, accounts[8].address],
    [expandDecimals(10, 18), expandDecimals(30, 18), expandDecimals(20, 18)],
  ]);
  const mockEndpointV2A = await deployContract("MockEndpointV2", [eidA]);
  // use separate mockEndpointV2B endpoint to avoid reentrancy issues when using mockEndpointV2
  const mockEndpointV2B = await deployContract("MockEndpointV2", [eidB]);
  const mockEndpointV2C = await deployContract("MockEndpointV2", [eidC]);
  const gmxA = await deployContract("MintableToken", ["GMX", "GMX", 18]);
  const gmxC = await deployContract("MintableToken", ["GMX", "GMX", 18]);
  const mockGmxAdapterA = await deployContract("MockGMX_Adapter", [
    [
      { dstEid: eidB, limit: expandDecimals(1000000, 18), window: 60 },
      { dstEid: eidC, limit: expandDecimals(1000000, 18), window: 60 },
    ],
    gmxA.address,
    gmxA.address,
    mockEndpointV2A.address,
    accounts[0].address,
  ]);
  const mockGmxAdapterB = await deployContract("MockGMX_Adapter", [
    [
      { dstEid: eidA, limit: expandDecimals(1000000, 18), window: 60 },
      { dstEid: eidC, limit: expandDecimals(1000000, 18), window: 60 },
    ],
    gmx.address,
    gmx.address,
    mockEndpointV2B.address,
    accounts[0].address,
  ]);
  const mockGmxAdapterC = await deployContract("MockGMX_Adapter", [
    [
      { dstEid: eidA, limit: expandDecimals(1000000, 18), window: 60 },
      { dstEid: eidB, limit: expandDecimals(1000000, 18), window: 60 },
    ],
    gmxC.address,
    gmxC.address,
    mockEndpointV2C.address,
    accounts[0].address,
  ]);

  await grantRole(roleStore, accounts[0].address, "FEE_DISTRIBUTION_KEEPER");

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

  const originator = feeDistributor.address;
  await config.setBool(keys.MULTICHAIN_AUTHORIZED_ORIGINATORS, encodeData(["address"], [originator]), "true");
  await config.setUint(keys.MULTICHAIN_READ_CHANNEL, "0x", channelId);
  await config.setBytes32(
    keys.MULTICHAIN_PEERS,
    encodeData(["uint256"], [channelId]),
    ethers.utils.hexZeroPad(multichainReader.address, 32)
  );
  for (const eid of [eidA, eidB, eidC]) {
    await config.setUint(keys.MULTICHAIN_CONFIRMATIONS, encodeData(["uint256"], [eid]), numberOfConfirmations);
  }

  await config.setUint(keys.FEE_DISTRIBUTOR_DISTRIBUTION_DAY, "0x", distributionDay);
  await feeDistributorConfig.moveToNextDistributionDay(distributionDay);
  const block = await ethers.provider.getBlock("latest");
  await dataStore.setUint(keys.FEE_DISTRIBUTOR_DISTRIBUTION_TIMESTAMP, block.timestamp);
  await feeDistributorConfig.moveToNextDistributionDay(distributionDay);

  await config.setUint(keys.FEE_DISTRIBUTOR_MAX_REFERRAL_REWARDS_WNT_USD_AMOUNT, "0x", expandDecimals(1_000_000, 30));
  await config.setUint(keys.FEE_DISTRIBUTOR_MAX_REFERRAL_REWARDS_ESGMX_AMOUNT, "0x", expandDecimals(100, 18));
  await config.setUint(keys.FEE_DISTRIBUTOR_MAX_READ_RESPONSE_DELAY, "0x", 86400);
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
    mockLzReadResponseChain1.address
  );
  await config.setAddress(
    keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
    encodeData(["uint256", "bytes32"], [chainIdB, feeDistributorConfig.extendedGmxTrackerKey]),
    mockExtendedGmxTracker.address
  );
  await config.setAddress(
    keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
    encodeData(["uint256", "bytes32"], [chainIdC, feeDistributorConfig.extendedGmxTrackerKey]),
    mockLzReadResponseChain3.address
  );
  await config.setAddress(
    keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
    encodeData(["uint256", "bytes32"], [chainIdA, feeDistributorConfig.dataStoreKey]),
    mockLzReadResponseChain1.address
  );
  await config.setAddress(
    keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
    encodeData(["uint256", "bytes32"], [chainIdC, feeDistributorConfig.dataStoreKey]),
    mockLzReadResponseChain3.address
  );
  await config.setAddress(
    keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
    encodeData(["uint256", "bytes32"], [chainIdB, feeDistributorConfig.feeGlpTrackerKey]),
    mockFeeGlpTracker.address
  );
  await config.setAddress(
    keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
    encodeData(["uint256", "bytes32"], [chainIdA, keys.FEE_RECEIVER]),
    accounts[1].address
  );
  await dataStore.setAddress(keys.FEE_RECEIVER, feeDistributorVault.address);
  await config.setAddress(
    keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
    encodeData(["uint256", "bytes32"], [chainIdC, keys.FEE_RECEIVER]),
    accounts[2].address
  );
  await config.setAddress(
    keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
    encodeData(["bytes32"], [feeDistributorConfig.layerzeroOftKey]),
    mockGmxAdapterB.address
  );
  await config.setAddress(
    keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
    encodeData(["bytes32"], [feeDistributorConfig.chainlinkKey]),
    accounts[9].address
  );
  await config.setAddress(
    keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
    encodeData(["bytes32"], [feeDistributorConfig.treasuryKey]),
    accounts[10].address
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

  await dataStore.setAddressArray(keys.FEE_DISTRIBUTOR_KEEPER_COSTS, [
    accounts[3].address,
    accounts[4].address,
    accounts[5].address,
  ]);
  await dataStore.setUintArray(keys.FEE_DISTRIBUTOR_KEEPER_COSTS, [
    expandDecimals(3, 15),
    expandDecimals(5, 15),
    expandDecimals(4, 15),
  ]);
  await dataStore.setBoolArray(keys.FEE_DISTRIBUTOR_KEEPER_COSTS, [true, false, true]);
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

  await accounts[3].sendTransaction({
    to: accounts[0].address,
    value: expandDecimals(10_000, 18).sub(expandDecimals(1, 15)),
  });
  await accounts[4].sendTransaction({
    to: accounts[0].address,
    value: expandDecimals(10_000, 18).sub(expandDecimals(2, 15)),
  });
  await accounts[5].sendTransaction({
    to: accounts[0].address,
    value: expandDecimals(10_000, 18).sub(expandDecimals(5, 15)),
  });

  await wnt.mint(feeDistributorVault.address, expandDecimals(1000, 18));
  await gmx.mint(feeHandler.address, expandDecimals(40_000, 18));

  await gmx.mint(accounts[0].address, expandDecimals(170_000, 18));
  let sendParam = {
    dstEid: eidA,
    to: addressToBytes32(accounts[1].address),
    amountLD: expandDecimals(40_000, 18),
    minAmountLD: expandDecimals(40_000, 18),
    extraOptions: ethers.utils.arrayify("0x"),
    composeMsg: ethers.utils.arrayify("0x"),
    oftCmd: ethers.utils.arrayify("0x"),
  };
  let feeQuote = await mockGmxAdapterB.quoteSend(sendParam, false);
  let nativeFee = feeQuote.nativeFee;
  await mockGmxAdapterB.send(sendParam, { nativeFee: nativeFee, lzTokenFee: 0 }, accounts[0].address, {
    value: nativeFee,
  });

  await gmx.transfer(feeDistributorVault.address, expandDecimals(120_000, 18));

  sendParam = {
    dstEid: eidC,
    to: addressToBytes32(accounts[2].address),
    amountLD: expandDecimals(10_000, 18),
    minAmountLD: expandDecimals(10_000, 18),
    extraOptions: ethers.utils.arrayify("0x"),
    composeMsg: ethers.utils.arrayify("0x"),
    oftCmd: ethers.utils.arrayify("0x"),
  };
  feeQuote = await mockGmxAdapterB.quoteSend(sendParam, false);
  nativeFee = feeQuote.nativeFee;
  await mockGmxAdapterB.send(sendParam, { nativeFee: nativeFee, lzTokenFee: 0 }, accounts[0].address, {
    value: nativeFee,
  });

  await accounts[0].sendTransaction({
    to: feeDistributor.address,
    value: expandDecimals(1, 18),
  });

  await mockLzReadResponseChain1.setTotalSupply(expandDecimals(3_000_000, 18));
  await mockExtendedGmxTracker.setTotalSupply(expandDecimals(6_000_000, 18));
  await mockLzReadResponseChain3.setTotalSupply(expandDecimals(3_000_000, 18));

  await mockLzReadResponseChain1.setUint(
    keys.withdrawableBuybackTokenAmountKey(gmxA.address),
    expandDecimals(10_000, 18)
  );
  await mockLzReadResponseChain3.setUint(
    keys.withdrawableBuybackTokenAmountKey(gmxC.address),
    expandDecimals(20_000, 18)
  );
  await dataStore.setUint(keys.withdrawableBuybackTokenAmountKey(gmx.address), expandDecimals(40_000, 18));

  console.log("Calling feeDistributor.initiateDistribute() …");
  const tx = await feeDistributor.initiateDistribute();
  const rc = await tx.wait();
  console.log("initiateDistribute tx mined @ block", rc.blockNumber, "hash:", rc.transactionHash);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
