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
  const eid1 = 1000,
    eid2 = 2000,
    eid3 = 3000;
  const chainId1 = 10000,
    chainId2 = 31337,
    chainId3 = 20000;
  const chainIds = [chainId1, chainId2, chainId3];
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
  const mockEndpointV2A = await deployContract("MockEndpointV2", [eid1]);
  // use separate mockEndpointV2B endpoint to avoid reentrancy issues when using mockEndpointV2
  const mockEndpointV2B = await deployContract("MockEndpointV2", [eid2]);
  const mockEndpointV2C = await deployContract("MockEndpointV2", [eid3]);
  const mockOftA = await deployContract("MockOFT", ["GMX", "GMX", mockEndpointV2A.address, accounts[0].address]);
  const mockOftAdapterB = await deployContract("MockOFTAdapter", [
    gmx.address,
    mockEndpointV2B.address,
    accounts[0].address,
  ]);
  const mockOftC = await deployContract("MockOFT", ["GMX", "GMX", mockEndpointV2C.address, accounts[0].address]);

  await grantRole(roleStore, accounts[0].address, "FEE_DISTRIBUTION_KEEPER");

  await mockEndpointV2.setDestLzEndpoint(multichainReader.address, mockEndpointV2.address);
  await mockEndpointV2.setReadChannelId(channelId);

  await mockEndpointV2A.setDestLzEndpoint(mockOftAdapterB.address, mockEndpointV2B.address);
  await mockEndpointV2A.setDestLzEndpoint(mockOftC.address, mockEndpointV2C.address);

  await mockEndpointV2B.setDestLzEndpoint(mockOftA.address, mockEndpointV2A.address);
  await mockEndpointV2B.setDestLzEndpoint(mockOftC.address, mockEndpointV2C.address);

  await mockEndpointV2C.setDestLzEndpoint(mockOftA.address, mockEndpointV2A.address);
  await mockEndpointV2C.setDestLzEndpoint(mockOftAdapterB.address, mockEndpointV2B.address);

  await mockOftA.setPeer(eid2, ethers.utils.zeroPad(mockOftAdapterB.address, 32));
  await mockOftA.setPeer(eid3, ethers.utils.zeroPad(mockOftC.address, 32));
  await mockOftA.setEnforcedOptions([{ eid: eid2, msgType: 1, options: options }]);
  await mockOftA.setEnforcedOptions([{ eid: eid3, msgType: 1, options: options }]);

  await mockOftAdapterB.setPeer(eid1, ethers.utils.zeroPad(mockOftA.address, 32));
  await mockOftAdapterB.setPeer(eid3, ethers.utils.zeroPad(mockOftC.address, 32));
  await mockOftAdapterB.setEnforcedOptions([{ eid: eid1, msgType: 1, options: options }]);
  await mockOftAdapterB.setEnforcedOptions([{ eid: eid3, msgType: 1, options: options }]);

  await mockOftC.setPeer(eid1, ethers.utils.zeroPad(mockOftA.address, 32));
  await mockOftC.setPeer(eid2, ethers.utils.zeroPad(mockOftAdapterB.address, 32));
  await mockOftC.setEnforcedOptions([{ eid: eid1, msgType: 1, options: options }]);
  await mockOftC.setEnforcedOptions([{ eid: eid2, msgType: 1, options: options }]);

  const originator = feeDistributor.address;
  await config.setBool(keys.MULTICHAIN_AUTHORIZED_ORIGINATORS, encodeData(["address"], [originator]), "true");
  await config.setUint(keys.MULTICHAIN_READ_CHANNEL, "0x", channelId);
  await config.setBytes32(
    keys.MULTICHAIN_PEERS,
    encodeData(["uint256"], [channelId]),
    ethers.utils.hexZeroPad(multichainReader.address, 32)
  );
  for (const eid of [eid1, eid2, eid3]) {
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
  await config.setUint(keys.FEE_DISTRIBUTOR_LAYERZERO_CHAIN_ID, encodeData(["uint256"], [chainId1]), eid1);
  await config.setUint(keys.FEE_DISTRIBUTOR_LAYERZERO_CHAIN_ID, encodeData(["uint256"], [chainId2]), eid2);
  await config.setUint(keys.FEE_DISTRIBUTOR_LAYERZERO_CHAIN_ID, encodeData(["uint256"], [chainId3]), eid3);

  await config.setAddress(
    keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
    encodeData(["uint256", "bytes32"], [chainId1, feeDistributorConfig.gmxKey]),
    mockOftA.address
  );
  await config.setAddress(
    keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
    encodeData(["uint256", "bytes32"], [chainId2, feeDistributorConfig.gmxKey]),
    gmx.address
  );
  await config.setAddress(
    keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
    encodeData(["uint256", "bytes32"], [chainId3, feeDistributorConfig.gmxKey]),
    mockOftC.address
  );
  await config.setAddress(
    keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
    encodeData(["uint256", "bytes32"], [chainId1, feeDistributorConfig.extendedGmxTrackerKey]),
    mockLzReadResponseChain1.address
  );
  await config.setAddress(
    keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
    encodeData(["uint256", "bytes32"], [chainId2, feeDistributorConfig.extendedGmxTrackerKey]),
    mockExtendedGmxTracker.address
  );
  await config.setAddress(
    keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
    encodeData(["uint256", "bytes32"], [chainId3, feeDistributorConfig.extendedGmxTrackerKey]),
    mockLzReadResponseChain3.address
  );
  await config.setAddress(
    keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
    encodeData(["uint256", "bytes32"], [chainId1, feeDistributorConfig.dataStoreKey]),
    mockLzReadResponseChain1.address
  );
  await config.setAddress(
    keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
    encodeData(["uint256", "bytes32"], [chainId3, feeDistributorConfig.dataStoreKey]),
    mockLzReadResponseChain3.address
  );
  await config.setAddress(
    keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
    encodeData(["uint256", "bytes32"], [chainId2, feeDistributorConfig.feeGlpTrackerKey]),
    mockFeeGlpTracker.address
  );
  await config.setAddress(
    keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
    encodeData(["uint256", "bytes32"], [chainId1, keys.FEE_RECEIVER]),
    accounts[1].address
  );
  await dataStore.setAddress(keys.FEE_RECEIVER, feeDistributorVault.address);
  await config.setAddress(
    keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
    encodeData(["uint256", "bytes32"], [chainId3, keys.FEE_RECEIVER]),
    accounts[2].address
  );
  await config.setAddress(
    keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
    encodeData(["bytes32"], [feeDistributorConfig.layerzeroOftKey]),
    mockOftAdapterB.address
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
  await dataStore.setAddress(keys.oracleProviderForTokenKey(oracle.address, wnt.address), chainlinkPriceFeedProvider.address);
  await dataStore.setAddress(keys.oracleProviderForTokenKey(oracle.address, gmx.address), chainlinkPriceFeedProvider.address);

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
  await gmx.mint(feeHandler.address, expandDecimals(10_000, 18));

  await gmx.mint(accounts[0].address, expandDecimals(170_000, 18));
  await gmx.approve(mockOftAdapterB.address, expandDecimals(130_000, 18));
  let sendParam = {
    dstEid: eid1,
    to: addressToBytes32(accounts[1].address),
    amountLD: expandDecimals(120_000, 18),
    minAmountLD: expandDecimals(120_000, 18),
    extraOptions: ethers.utils.arrayify("0x"),
    composeMsg: ethers.utils.arrayify("0x"),
    oftCmd: ethers.utils.arrayify("0x"),
  };
  let feeQuote = await mockOftAdapterB.quoteSend(sendParam, false);
  let nativeFee = feeQuote.nativeFee;
  await mockOftAdapterB.send(sendParam, { nativeFee: nativeFee, lzTokenFee: 0 }, accounts[0].address, {
    value: nativeFee,
  });

  await gmx.transfer(feeDistributorVault.address, expandDecimals(40_000, 18));

  sendParam = {
    dstEid: eid3,
    to: addressToBytes32(accounts[2].address),
    amountLD: expandDecimals(10_000, 18),
    minAmountLD: expandDecimals(10_000, 18),
    extraOptions: ethers.utils.arrayify("0x"),
    composeMsg: ethers.utils.arrayify("0x"),
    oftCmd: ethers.utils.arrayify("0x"),
  };
  feeQuote = await mockOftAdapterB.quoteSend(sendParam, false);
  nativeFee = feeQuote.nativeFee;
  await mockOftAdapterB.send(sendParam, { nativeFee: nativeFee, lzTokenFee: 0 }, accounts[0].address, {
    value: nativeFee,
  });

  await accounts[0].sendTransaction({
    to: feeDistributor.address,
    value: expandDecimals(1, 18),
  });

  await mockLzReadResponseChain1.setTotalSupply(expandDecimals(6_000_000, 18));
  await mockExtendedGmxTracker.setTotalSupply(expandDecimals(3_000_000, 18));
  await mockLzReadResponseChain3.setTotalSupply(expandDecimals(3_000_000, 18));

  await mockLzReadResponseChain1.setUint(
    keys.withdrawableBuybackTokenAmountKey(mockOftA.address),
    expandDecimals(40_000, 18)
  );
  await mockLzReadResponseChain3.setUint(
    keys.withdrawableBuybackTokenAmountKey(mockOftC.address),
    expandDecimals(20_000, 18)
  );
  await dataStore.setUint(keys.withdrawableBuybackTokenAmountKey(gmx.address), expandDecimals(10_000, 18));

  console.log("Calling feeDistributor.initiateDistribute()");
  const tx1 = await feeDistributor.initiateDistribute();
  const rc1 = await tx1.wait();
  console.log("initiateDistribute tx mined @ block", rc1.blockNumber, "hash:", rc1.transactionHash);

  sendParam = {
    dstEid: eid2,
    to: addressToBytes32(feeDistributorVault.address),
    amountLD: expandDecimals(10_000, 18),
    minAmountLD: expandDecimals(10_000, 18),
    extraOptions: ethers.utils.arrayify("0x"),
    composeMsg: ethers.utils.arrayify("0x"),
    oftCmd: ethers.utils.arrayify("0x"),
  };
  feeQuote = await mockOftA.quoteSend(sendParam, false);
  nativeFee = feeQuote.nativeFee;
  await mockOftA.connect(accounts[1]).send(sendParam, { nativeFee: nativeFee, lzTokenFee: 0 }, accounts[1].address, {
    value: nativeFee,
  });

  sendParam = {
    dstEid: eid3,
    to: addressToBytes32(accounts[2].address),
    amountLD: expandDecimals(30_000, 18),
    minAmountLD: expandDecimals(30_000, 18),
    extraOptions: ethers.utils.arrayify("0x"),
    composeMsg: ethers.utils.arrayify("0x"),
    oftCmd: ethers.utils.arrayify("0x"),
  };
  feeQuote = await mockOftA.quoteSend(sendParam, false);
  nativeFee = feeQuote.nativeFee;
  await mockOftA.connect(accounts[1]).send(sendParam, { nativeFee: nativeFee, lzTokenFee: 0 }, accounts[1].address, {
    value: nativeFee,
  });

  console.log("Calling feeDistributor.bridgedGmxReceived()");
  const tx2 = await feeDistributor.bridgedGmxReceived();
  const rc2 = await tx2.wait();
  console.log("bridgedGmxReceived tx mined @ block", rc2.blockNumber, "hash:", rc2.transactionHash);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
