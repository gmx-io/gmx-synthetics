import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { Contract, ContractFactory, Signer, BigNumber } from "ethers";

import * as keys from "../utils/keys";
import { hashString, encodeData } from "../utils/hash";
import { expandDecimals } from "../utils/math";
import { Options } from "@layerzerolabs/lz-v2-utilities";

type ChainConfig = {
  currentChainId: number;
  chainIds: number[];
  eids: number[];
  channelId: number;
  wntTargetBalance: BigNumber;
};

type DeploymentData = {
  network: string;
  timestamp: string;
  deployer: string;
  contracts: {
    [key: string]: string;
  };
  config: any;
};

type TestScenario = {
  scenario: "surplus" | "deficit";
  stakedGmxAmount: string;
  withdrawableBuybackAmount: string;
  vaultGmxAmount: string;
  wntAmount: string;
};

const resetDistributionTimestampStr = process.env.RESET_DISTRIBUTION_TIMESTAMP;
if (!resetDistributionTimestampStr) {
  throw new Error("RESET_DISTRIBUTION_TIMESTAMP environment variable not provided");
}
if (resetDistributionTimestampStr !== "true" && resetDistributionTimestampStr !== "false") {
  throw new Error('RESET_DISTRIBUTION_TIMESTAMP environment must equal "true" or "false"');
}
const resetDistributionTimestamp = resetDistributionTimestampStr === "true";

const ZERO = BigNumber.from(0);

const CHAIN_PAIRS = {
  localhost: {
    chainA: { chainId: 10000, tag: "chainA", eid: 1000 },
    chainB: { chainId: 31337, tag: "chainB", eid: 2000 },
  },
  testnet: {
    arbitrum: { chainId: 421614, network: "arbitrumSepolia", eid: 40231 },
    base: { chainId: 84532, network: "baseSepolia", eid: 40245 },
  },
  mainnet: {
    arbitrum: { chainId: 42161, network: "arbitrum", eid: 30110 },
    avalanche: { chainId: 43114, network: "avalanche", eid: 30106 },
  },
};

const SCENARIOS: { [key: string]: TestScenario } = {
  surplus: {
    scenario: "surplus",
    stakedGmxAmount: expandDecimals(3_000_000, 18).toString(),
    withdrawableBuybackAmount: expandDecimals(40_000, 18).toString(),
    vaultGmxAmount: expandDecimals(120_000, 18).toString(),
    wntAmount: expandDecimals(1_000, 18).toString(),
  },
  deficit: {
    scenario: "deficit",
    stakedGmxAmount: expandDecimals(6_000_000, 18).toString(),
    withdrawableBuybackAmount: expandDecimals(10_000, 18).toString(),
    vaultGmxAmount: expandDecimals(50_000, 18).toString(),
    wntAmount: expandDecimals(500, 18).toString(),
  },
};

const options = Options.newOptions().addExecutorLzReceiveOption(300000, 0).toHex().toString();

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getFactory(deployer: ethers.SignerWithAddress, contractName: string, libraries?: any) {
  if (libraries) {
    return await ethers.getContractFactory(contractName, {
      signer: deployer,
      libraries: libraries.libraries || libraries,
    });
  }
  return await ethers.getContractFactory(contractName, deployer);
}

async function loadDeployment(network: string, tag: string): Promise<DeploymentData | null> {
  const deploymentsDir = path.join(__dirname, "../deployments");

  if (!fs.existsSync(deploymentsDir)) {
    return null;
  }

  const files = fs.readdirSync(deploymentsDir);

  const searchPattern = `deployment-${network}-${tag}-`;
  const deploymentFiles = files.filter((f) => f.startsWith(searchPattern));

  if (deploymentFiles.length === 0) {
    return null;
  }

  deploymentFiles.sort();
  const latestFile = deploymentFiles[deploymentFiles.length - 1];

  console.log(`Loading deployment from ${latestFile}`);
  return JSON.parse(fs.readFileSync(path.join(deploymentsDir, latestFile), "utf8"));
}

function determineOtherChain(network: string, currentChainId: number, DEPLOYMENT_TAG: string) {
  if (network === "localhost") {
    if (DEPLOYMENT_TAG === "chainA") {
      return {
        otherChainId: CHAIN_PAIRS.localhost.chainB.chainId,
        otherTag: "chainB",
        otherNetwork: "localhost",
        otherEid: CHAIN_PAIRS.localhost.chainB.eid,
      };
    } else if (DEPLOYMENT_TAG === "chainB") {
      return {
        otherChainId: CHAIN_PAIRS.localhost.chainA.chainId,
        otherTag: "chainA",
        otherNetwork: "localhost",
        otherEid: CHAIN_PAIRS.localhost.chainA.eid,
      };
    }
  } else {
    if (currentChainId === CHAIN_PAIRS.testnet.arbitrum.chainId) {
      return {
        otherChainId: CHAIN_PAIRS.testnet.base.chainId,
        otherTag: undefined,
        otherNetwork: CHAIN_PAIRS.testnet.base.network,
        otherEid: CHAIN_PAIRS.testnet.base.eid,
      };
    } else if (currentChainId === CHAIN_PAIRS.testnet.base.chainId) {
      return {
        otherChainId: CHAIN_PAIRS.testnet.arbitrum.chainId,
        otherTag: undefined,
        otherNetwork: CHAIN_PAIRS.testnet.arbitrum.network,
        otherEid: CHAIN_PAIRS.testnet.arbitrum.eid,
      };
    } else if (currentChainId === CHAIN_PAIRS.mainnet.arbitrum.chainId) {
      return {
        otherChainId: CHAIN_PAIRS.mainnet.avalanche.chainId,
        otherTag: undefined,
        otherNetwork: CHAIN_PAIRS.mainnet.avalanche.network,
        otherEid: CHAIN_PAIRS.mainnet.avalanche.eid,
      };
    } else if (currentChainId === CHAIN_PAIRS.mainnet.avalanche.chainId) {
      return {
        otherChainId: CHAIN_PAIRS.mainnet.arbitrum.chainId,
        otherTag: undefined,
        otherNetwork: CHAIN_PAIRS.mainnet.arbitrum.network,
        otherEid: CHAIN_PAIRS.mainnet.arbitrum.eid,
      };
    }
  }

  return null;
}

async function setupTestData(
  contracts: any,
  scenario: TestScenario,
  deployer: Signer,
  network: string,
  wntTargetBalance: BigNumber,
  DEPLOYMENT_TAG: string
): Promise<void> {
  console.log("\nSetting up test data");
  console.log(`Scenario: ${scenario.scenario} chain\n`);

  const txDelay = network === "localhost" ? 0 : 1000;

  const DataStore = await getFactory(deployer, "DataStore");
  const dataStore = DataStore.attach(contracts.dataStore);

  const MintableToken = await getFactory(deployer, "MintableToken");
  const gmx = MintableToken.attach(contracts.gmx);
  const wnt = MintableToken.attach(contracts.wnt);
  const esGmx = MintableToken.attach(contracts.esGmx);
  const feeVault = await ethers.getContract("FeeVault");
  const feeVaultAddress = await feeVault.getAddress();

  const MockRewardTrackerV1 = await getFactory(deployer, "MockRewardTrackerV1");
  const mockExtendedGmxTracker = MockRewardTrackerV1.attach(contracts.mockExtendedGmxTracker);

  // Set up mock staked GMX amount
  await mockExtendedGmxTracker.setTotalSupply(scenario.stakedGmxAmount);
  console.log(`Set staked GMX: ${ethers.utils.formatEther(scenario.stakedGmxAmount)}`);
  await delay(txDelay);

  // Set withdrawable buyback amount
  await dataStore.setUint(keys.withdrawableBuybackTokenAmountKey(contracts.gmx), scenario.withdrawableBuybackAmount);
  console.log(`Set withdrawable GMX: ${ethers.utils.formatEther(scenario.withdrawableBuybackAmount)}`);
  await delay(txDelay);

  // Mint GMX to FeeVault
  let currentBalance = await gmx.balanceOf(feeVaultAddress);
  if (currentBalance > ZERO) {
    await gmx.burn(feeVaultAddress, currentBalance);
    console.log(`Burned GMX in FeeVault: ${ethers.utils.formatEther(currentBalance)}`);
    await delay(txDelay);
  }
  await gmx.mint(feeVaultAddress, scenario.withdrawableBuybackAmount);
  console.log(`Minted GMX to FeeVault: ${ethers.utils.formatEther(scenario.withdrawableBuybackAmount)}`);
  await delay(txDelay);

  // Mint GMX to FeeDistributorVault
  currentBalance = await gmx.balanceOf(contracts.feeDistributorVault);
  if (currentBalance > ZERO) {
    await gmx.burn(contracts.feeDistributorVault, currentBalance);
    console.log(`Burned GMX in FeeDistributorVault: ${ethers.utils.formatEther(currentBalance)}`);
    await delay(txDelay);
  }
  await gmx.mint(contracts.feeDistributorVault, scenario.vaultGmxAmount);
  console.log(`Minted GMX to FeeDistributorVault: ${ethers.utils.formatEther(scenario.vaultGmxAmount)}`);
  await delay(txDelay);

  // Mint WNT to FeeDistributorVault
  currentBalance = await wnt.balanceOf(contracts.feeDistributorVault);
  if (currentBalance > ZERO) {
    await wnt.burn(contracts.feeDistributorVault, currentBalance);
    console.log(`Burned WNT in FeeDistributorVault: ${ethers.utils.formatEther(currentBalance)}`);
    await delay(txDelay);
  }
  await wnt.mint(contracts.feeDistributorVault, scenario.wntAmount);
  console.log(`Minted WNT to FeeDistributorVault: ${ethers.utils.formatEther(scenario.wntAmount)}`);
  await delay(txDelay);

  // Mint some esGMX to FeeDistributorVault for referral rewards
  currentBalance = await esGmx.balanceOf(contracts.feeDistributorVault);
  if (currentBalance > ZERO) {
    await esGmx.burn(contracts.feeDistributorVault, currentBalance);
    console.log(`Burned esGMX in FeeDistributorVault: ${ethers.utils.formatEther(currentBalance)}`);
    await delay(txDelay);
  }
  await esGmx.mint(contracts.feeDistributorVault, expandDecimals(10, 18));
  console.log("Minted 10 esGMX to FeeDistributorVault for referral rewards");
  await delay(txDelay);

  // Fund FeeDistributor with ETH for gas
  currentBalance = await ethers.provider.getBalance(contracts.feeDistributor);
  console.log("Current FeeDistributor ETH balance: ", ethers.utils.formatEther(currentBalance));
  const sendAmount = wntTargetBalance.sub(currentBalance);
  console.log("ETH send amount: ", ethers.utils.formatEther(sendAmount));
  await deployer.sendTransaction({
    to: contracts.feeDistributor,
    value: sendAmount,
  });
  console.log(
    `Funded FeeDistributor with ${ethers.utils.formatEther(
      sendAmount
    )} ETH for gas for a total of ${ethers.utils.formatEther(wntTargetBalance)} WNT`
  );
  await delay(txDelay);

  // Calculate expected distribution
  const totalFees = BigNumber.from(scenario.withdrawableBuybackAmount).add(scenario.vaultGmxAmount);
  const stakedGmx = BigNumber.from(scenario.stakedGmxAmount);
  const feePerStakedGmx = totalFees.mul(expandDecimals(1, 18)).div(stakedGmx);

  console.log("\nTest Data Summary:");
  console.log(`Network:              ${network}${DEPLOYMENT_TAG ? ` (${DEPLOYMENT_TAG})` : ""}`);
  console.log(`Scenario:             ${scenario.scenario} chain`);
  console.log(`Staked GMX:           ${ethers.utils.formatEther(scenario.stakedGmxAmount)}`);
  console.log(`Withdrawable GMX:     ${ethers.utils.formatEther(scenario.withdrawableBuybackAmount)}`);
  console.log(`Vault GMX:            ${ethers.utils.formatEther(scenario.vaultGmxAmount)}`);
  console.log(`Vault WNT:            ${ethers.utils.formatEther(scenario.wntAmount)}`);
  console.log(`Total fees:           ${ethers.utils.formatEther(totalFees)}`);
  console.log(`Fee per staked GMX:   ${ethers.utils.formatEther(feePerStakedGmx)}`);

  if (scenario.scenario === "surplus") {
    console.log("\n This chain has SURPLUS fees (will bridge GMX OUT to deficit chains)");
  } else {
    console.log("\n This chain has DEFICIT fees (will receive GMX IN from surplus chains)");
  }
}

async function configureContracts(
  chainConfig: ChainConfig
): Promise<{ deployment: DeploymentData; config: ChainConfig }> {
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const network = process.env.HARDHAT_NETWORK || "localhost";
  const DEPLOYMENT_TAG = process.env.DEPLOYMENT_TAG || "";
  const setupData = process.env.SETUP_DATA || "";
  const scenarioOverride = process.env.SCENARIO || "";

  const txDelay = 5000;

  console.log("\nConfiguring contracts");
  console.log("Network:", network);
  if (DEPLOYMENT_TAG) {
    console.log("Deployment tag:", DEPLOYMENT_TAG);
  }
  console.log("Account:", deployerAddress);
  if (setupData) {
    console.log(`Will setup test data: ${setupData}\n`);
  }

  // Load current deployment
  const deployment = await loadDeployment(network, DEPLOYMENT_TAG);
  if (!deployment) {
    throw new Error(`No deployment found for ${network}${DEPLOYMENT_TAG ? ` (${DEPLOYMENT_TAG})` : ""}`);
  }
  const contracts = deployment.contracts;

  // Try to load other chain's deployment
  const otherChainInfo = determineOtherChain(network, chainConfig.currentChainId, DEPLOYMENT_TAG);
  let otherContracts = null;

  if (otherChainInfo) {
    const otherDeployment = await loadDeployment(otherChainInfo.otherNetwork, otherChainInfo.otherTag);
    if (otherDeployment) {
      otherContracts = otherDeployment.contracts;
      console.log(
        `Found deployment for other chain (${otherChainInfo.otherNetwork}${
          otherChainInfo.otherTag ? ` ${otherChainInfo.otherTag}` : ""
        })`
      );
    } else {
      console.log(`No deployment found for other chain - will use AddressZero`);
    }
  }

  // Get contract instances
  const Config: ContractFactory = await getFactory(deployer, "Config", {
    libraries: {
      ConfigUtils: contracts.configUtils,
    },
  });
  const config: Contract = Config.attach(contracts.config);

  const DataStore: ContractFactory = await getFactory(deployer, "DataStore");
  const dataStore: Contract = DataStore.attach(contracts.dataStore);

  console.log("\n1. Configuring Oracle Price Feeds...");

  // Enable the ChainlinkPriceFeedProvider as an oracle provider
  await dataStore.setBool(keys.isOracleProviderEnabledKey(contracts.chainlinkPriceFeedProvider), true);
  console.log("Enabled ChainlinkPriceFeedProvider as oracle provider");
  await delay(txDelay);

  // Set as atomic oracle provider
  await dataStore.setBool(keys.isAtomicOracleProviderKey(contracts.chainlinkPriceFeedProvider), true);
  console.log("Set ChainlinkPriceFeedProvider as atomic oracle provider");
  await delay(txDelay);

  // Configure oracle providers for tokens
  await dataStore.setAddress(
    keys.oracleProviderForTokenKey(contracts.oracle, contracts.wnt),
    contracts.chainlinkPriceFeedProvider
  );
  console.log("Set oracle provider for WNT");
  await delay(txDelay);

  await dataStore.setAddress(
    keys.oracleProviderForTokenKey(contracts.oracle, contracts.gmx),
    contracts.chainlinkPriceFeedProvider
  );
  console.log("Set oracle provider for GMX");
  await delay(txDelay);

  // Configure price feed addresses directly in DataStore
  await dataStore.setAddress(keys.priceFeedKey(contracts.wnt), contracts.wethPriceFeed);
  console.log("Set WETH price feed in DataStore");
  await delay(txDelay);

  await dataStore.setAddress(keys.priceFeedKey(contracts.gmx), contracts.gmxPriceFeed);
  console.log("Set GMX price feed in DataStore");
  await delay(txDelay);

  // Set price feed multipliers
  await dataStore.setUint(keys.priceFeedMultiplierKey(contracts.wnt), expandDecimals(1, 34));
  await delay(txDelay);

  await dataStore.setUint(keys.priceFeedMultiplierKey(contracts.gmx), expandDecimals(1, 34));
  console.log("Set price feed multipliers");
  await delay(txDelay);

  // Set heartbeat durations
  await dataStore.setUint(
    keys.priceFeedHeartbeatDurationKey(contracts.wnt),
    3600 // 1 hour
  );
  await delay(txDelay);

  await dataStore.setUint(keys.priceFeedHeartbeatDurationKey(contracts.gmx), 3600);
  console.log("Set heartbeat durations");
  await delay(txDelay);

  console.log("Oracle price feeds configured");

  console.log("\n2. Configuring FeeDistributor parameters...");

  // Basic configuration
  const distributionDay = 3; // Wednesday
  await config.setUint(keys.FEE_DISTRIBUTOR_DISTRIBUTION_DAY, "0x", distributionDay);
  console.log("Set distribution day to:", distributionDay);
  await delay(txDelay);

  await dataStore.setUint(keys.FEE_DISTRIBUTOR_STATE, 0);
  await delay(txDelay);

  await config.setUint(keys.FEE_DISTRIBUTOR_V1_FEES_WNT_FACTOR, "0x", expandDecimals(70, 28));
  await delay(txDelay);
  await config.setUint(keys.FEE_DISTRIBUTOR_V2_FEES_WNT_FACTOR, "0x", expandDecimals(10, 28));
  await delay(txDelay);
  await config.setUint(keys.FEE_DISTRIBUTOR_MAX_REFERRAL_REWARDS_WNT_USD_AMOUNT, "0x", expandDecimals(1_000_000, 30));
  await delay(txDelay);
  await config.setUint(keys.FEE_DISTRIBUTOR_MAX_REFERRAL_REWARDS_ESGMX_AMOUNT, "0x", expandDecimals(5000, 18));
  await delay(txDelay);
  await config.setUint(keys.FEE_DISTRIBUTOR_MAX_READ_RESPONSE_DELAY, "0x", 259200); // 3 days
  await delay(txDelay);
  await config.setUint(keys.FEE_DISTRIBUTOR_GAS_LIMIT, "0x", 5_000_000);
  await delay(txDelay);
  await config.setUint(keys.FEE_DISTRIBUTOR_MAX_REFERRAL_REWARDS_WNT_USD_FACTOR, "0x", expandDecimals(20, 28));
  await delay(txDelay);
  await config.setUint(keys.FEE_DISTRIBUTOR_MAX_WNT_AMOUNT_FROM_TREASURY, "0x", expandDecimals(1, 16));
  await delay(txDelay);
  await config.setUint(keys.FEE_DISTRIBUTOR_CHAINLINK_FACTOR, "0x", expandDecimals(12, 28));
  await delay(txDelay);
  console.log("Basic fee distribution parameters configured");

  // Configure chain IDs
  await dataStore.setUintArray(keys.FEE_DISTRIBUTOR_CHAIN_ID, chainConfig.chainIds);
  console.log("Set chain IDs:", chainConfig.chainIds);
  await delay(txDelay);

  // Configure LayerZero endpoint IDs for each chain
  for (let i = 0; i < chainConfig.chainIds.length; i++) {
    const chainId = chainConfig.chainIds[i];
    const eid = chainConfig.eids[i];

    await config.setUint(keys.FEE_DISTRIBUTOR_LAYERZERO_CHAIN_ID, encodeData(["uint256"], [chainId]), eid);
    console.log(`Set LayerZero endpoint ID for chain ${chainId}: ${eid}`);
    await delay(txDelay);
  }

  // Configure addresses for each chain
  console.log("\n3. Configuring chain-specific addresses...");

  for (let i = 0; i < chainConfig.chainIds.length; i++) {
    const chainId = chainConfig.chainIds[i];
    const isCurrentChain = chainId === chainConfig.currentChainId;

    let gmxAddress, trackerAddress, dataStoreAddress, feeReceiverAddress;

    if (isCurrentChain) {
      // Use current chain's contracts
      gmxAddress = contracts.gmx;
      trackerAddress = contracts.mockExtendedGmxTracker;
      dataStoreAddress = contracts.dataStore;
      feeReceiverAddress = contracts.feeDistributorVault;
    } else if (otherContracts) {
      // Use other chain's contracts if available
      gmxAddress = otherContracts.gmx;
      trackerAddress = otherContracts.mockExtendedGmxTracker;
      dataStoreAddress = otherContracts.dataStore;
      feeReceiverAddress = otherContracts.feeDistributorVault;
    } else {
      // Use AddressZero if other chain not deployed yet
      gmxAddress = ethers.constants.AddressZero;
      trackerAddress = ethers.constants.AddressZero;
      dataStoreAddress = ethers.constants.AddressZero;
      feeReceiverAddress = ethers.constants.AddressZero;
    }

    if (gmxAddress !== ethers.constants.AddressZero) {
      await config.setAddress(
        keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
        encodeData(["uint256", "bytes32"], [chainId, hashString("GMX")]),
        gmxAddress
      );
      await delay(txDelay);

      await config.setAddress(
        keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
        encodeData(["uint256", "bytes32"], [chainId, hashString("EXTENDED_GMX_TRACKER")]),
        trackerAddress
      );
      await delay(txDelay);

      await config.setAddress(
        keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
        encodeData(["uint256", "bytes32"], [chainId, hashString("DATASTORE")]),
        dataStoreAddress
      );
      await delay(txDelay);

      await config.setAddress(
        keys.FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN,
        encodeData(["uint256", "bytes32"], [chainId, keys.FEE_RECEIVER]),
        feeReceiverAddress
      );
      await delay(txDelay);

      console.log(`Configured addresses for chain ${chainId} (${isCurrentChain ? "current" : "other"})`);
    } else {
      console.log(`Skipped chain ${chainId} - no deployment found`);
    }

    // Bridge slippage factor
    await config.setUint(
      keys.FEE_DISTRIBUTOR_BRIDGE_SLIPPAGE_FACTOR,
      encodeData(["uint256"], [chainId]),
      expandDecimals(99, 28) // 99%
    );
    await delay(txDelay);
  }

  // Set current chain fee receiver
  await dataStore.setAddress(keys.FEE_RECEIVER, contracts.feeDistributorVault);
  console.log("Set fee receiver to:", contracts.feeDistributorVault);
  await delay(txDelay);

  // Configure general addresses - use gmxAdapter from deployment
  await config.setAddress(
    keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
    encodeData(["bytes32"], [hashString("LAYERZERO_OFT")]),
    contracts.gmxAdapter
  );
  await delay(txDelay);

  await config.setAddress(
    keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
    encodeData(["bytes32"], [hashString("CHAINLINK")]),
    deployerAddress
  );
  await delay(txDelay);

  await config.setAddress(
    keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
    encodeData(["bytes32"], [hashString("TREASURY")]),
    deployerAddress
  );
  await delay(txDelay);

  await config.setAddress(
    keys.FEE_DISTRIBUTOR_ADDRESS_INFO,
    encodeData(["bytes32"], [hashString("ESGMX_VESTER")]),
    contracts.mockVester
  );
  await delay(txDelay);

  console.log("General addresses configured");

  // Configure keeper costs
  console.log("\n4. Configuring keeper costs...");

  const keeperAddresses = [deployerAddress];
  const keeperTargetBalances = [expandDecimals(1, 15)];
  const keepersV2 = [true];

  await dataStore.setAddressArray(keys.FEE_DISTRIBUTOR_KEEPER_COSTS, keeperAddresses);
  await delay(txDelay);
  await dataStore.setUintArray(keys.FEE_DISTRIBUTOR_KEEPER_COSTS, keeperTargetBalances);
  await delay(txDelay);
  await dataStore.setBoolArray(keys.FEE_DISTRIBUTOR_KEEPER_COSTS, keepersV2);
  await delay(txDelay);

  console.log("Keeper costs configured");

  // Configure buyback amounts
  await config.setUint(keys.BUYBACK_BATCH_AMOUNT, encodeData(["address"], [contracts.gmx]), expandDecimals(5, 17));
  await delay(txDelay);
  await config.setUint(keys.BUYBACK_BATCH_AMOUNT, encodeData(["address"], [contracts.wnt]), expandDecimals(5, 17));
  await delay(txDelay);

  // Configure token transfer gas limits
  await dataStore.setUint(keys.tokenTransferGasLimit(contracts.gmx), 200_000);
  await delay(txDelay);
  await dataStore.setUint(keys.tokenTransferGasLimit(contracts.wnt), 200_000);
  await delay(txDelay);
  await dataStore.setUint(keys.tokenTransferGasLimit(contracts.esGmx), 200_000);
  await delay(txDelay);

  // Configure MultichainReader
  console.log("\n5. Configuring MultichainReader...");

  await config.setBool(
    keys.MULTICHAIN_AUTHORIZED_ORIGINATORS,
    encodeData(["address"], [contracts.feeDistributor]),
    true
  );
  await delay(txDelay);

  await config.setUint(keys.MULTICHAIN_READ_CHANNEL, "0x", chainConfig.channelId);
  await delay(txDelay);

  await config.setBytes32(
    keys.MULTICHAIN_PEERS,
    encodeData(["uint256"], [chainConfig.channelId]),
    ethers.utils.hexZeroPad(contracts.multichainReader, 32)
  );
  await delay(txDelay);

  // Set confirmations for each endpoint
  for (const eid of chainConfig.eids) {
    await config.setUint(
      keys.MULTICHAIN_CONFIRMATIONS,
      encodeData(["uint256"], [eid]),
      1 // Number of confirmations
    );
    await delay(txDelay);
  }

  console.log("MultichainReader configured");

  // Configure mock endpoints for local testing
  if (network === "localhost") {
    console.log("\n6. Configuring mock endpoints for local testing...");

    const MockEndpointV2: ContractFactory = await getFactory(deployer, "MockEndpointV2");

    // Configure the MultichainReader's endpoint (uses separate endpoint to avoid reentrancy)
    const mockEndpointMultichainReader: Contract = MockEndpointV2.attach(contracts.mockEndpointMultichainReader);
    await mockEndpointMultichainReader.setDestLzEndpoint(
      contracts.multichainReader,
      mockEndpointMultichainReader.address
    );
    await delay(txDelay);
    await mockEndpointMultichainReader.setReadChannelId(chainConfig.channelId);
    console.log("Configured MockEndpointV2 for MultichainReader");
    await delay(txDelay);

    const mockEndpointGmxAdapter: Contract = MockEndpointV2.attach(contracts.mockEndpointGmxAdapter);
    await mockEndpointGmxAdapter.setDestLzEndpoint(otherContracts.gmxAdapter, otherContracts.mockEndpointGmxAdapter);
    console.log("Configured MockEndpointV2 for GmxAdapter");
    console.log("Mock endpoints configured");
    await delay(txDelay);
  }

  const MockGMXAdapter: ContractFactory = await getFactory("MockGMX_MintBurnAdapter");
  const gmxAdapter: Contract = MockGMXAdapter.attach(contracts.gmxAdapter);
  await gmxAdapter.setPeer(otherChainInfo.otherEid, ethers.utils.zeroPad(otherContracts.gmxAdapter, 32));
  await delay(txDelay);
  await gmxAdapter.setEnforcedOptions([{ eid: otherChainInfo.otherEid, msgType: 1, options: options }]);
  await delay(txDelay);

  // Reset distribution timestamp if resetDistributionTimestamp = true
  if (resetDistributionTimestamp) {
    await dataStore.setUint(keys.FEE_DISTRIBUTOR_DISTRIBUTION_TIMESTAMP, 0);
    await delay(txDelay);
  }

  console.log("\nConfiguration complete!");

  if (otherContracts) {
    console.log("Both chains configured with cross-chain addresses");
  } else {
    console.log("Only current chain configured - other chain not deployed yet");
  }

  // Setup test data if requested
  if (setupData === "true" || setupData === "1") {
    let scenario: TestScenario;

    if (scenarioOverride && SCENARIOS[scenarioOverride]) {
      // Use explicitly specified scenario
      scenario = SCENARIOS[scenarioOverride];
    } else if (network === "localhost" && DEPLOYMENT_TAG) {
      // For localhost, chainA gets deficit, chainB gets surplus by default
      scenario = DEPLOYMENT_TAG === "chainA" ? SCENARIOS.deficit : SCENARIOS.surplus;
    } else {
      // For testnets and mainnets, use scenario override or default to surplus
      scenario = SCENARIOS[scenarioOverride] || SCENARIOS.surplus;
    }

    await setupTestData(contracts, scenario, deployer, network, chainConfig.wntTargetBalance, DEPLOYMENT_TAG);
    console.log("\nTest data setup complete!");
  }

  return {
    deployment,
    config: chainConfig,
  };
}

// Run configuration
async function main(): Promise<void> {
  const network = process.env.HARDHAT_NETWORK || "localhost";
  const DEPLOYMENT_TAG = process.env.DEPLOYMENT_TAG;
  if (!DEPLOYMENT_TAG) {
    throw new Error("Environment variable DEPLOYMENT_TAG not set");
  }
  if (DEPLOYMENT_TAG !== "chainA" && DEPLOYMENT_TAG !== "chainB") {
    throw new Error('Environment variable DEPLOYMENT_TAG must equal "chainA" or "chainB"');
  }

  let chainConfig: ChainConfig;

  if (network === "localhost") {
    if (DEPLOYMENT_TAG === "chainA") {
      chainConfig = {
        currentChainId: CHAIN_PAIRS.localhost.chainA.chainId,
        chainIds: [CHAIN_PAIRS.localhost.chainA.chainId, CHAIN_PAIRS.localhost.chainB.chainId],
        eids: [CHAIN_PAIRS.localhost.chainA.eid, CHAIN_PAIRS.localhost.chainB.eid],
        channelId: 1001,
        wntTargetBalance: expandDecimals(1, 17),
      };
    } else if (DEPLOYMENT_TAG === "chainB") {
      chainConfig = {
        currentChainId: CHAIN_PAIRS.localhost.chainB.chainId,
        chainIds: [CHAIN_PAIRS.localhost.chainA.chainId, CHAIN_PAIRS.localhost.chainB.chainId],
        eids: [CHAIN_PAIRS.localhost.chainA.eid, CHAIN_PAIRS.localhost.chainB.eid],
        channelId: 1001,
        wntTargetBalance: expandDecimals(1, 17),
      };
    } else {
      throw new Error("For localhost, DEPLOYMENT_TAG must be 'chainA' or 'chainB'");
    }
  } else if (network === "arbitrumSepolia") {
    chainConfig = {
      currentChainId: CHAIN_PAIRS.testnet.arbitrum.chainId,
      chainIds: [CHAIN_PAIRS.testnet.arbitrum.chainId, CHAIN_PAIRS.testnet.base.chainId],
      eids: [CHAIN_PAIRS.testnet.arbitrum.eid, CHAIN_PAIRS.testnet.base.eid],
      channelId: 4294967295,
      wntTargetBalance: expandDecimals(1, 16),
    };
  } else if (network === "baseSepolia") {
    chainConfig = {
      currentChainId: CHAIN_PAIRS.testnet.base.chainId,
      chainIds: [CHAIN_PAIRS.testnet.arbitrum.chainId, CHAIN_PAIRS.testnet.base.chainId],
      eids: [CHAIN_PAIRS.testnet.arbitrum.eid, CHAIN_PAIRS.testnet.base.eid],
      channelId: 4294967295,
      wntTargetBalance: expandDecimals(1, 16),
    };
  } else if (network === "arbitrum") {
    chainConfig = {
      currentChainId: CHAIN_PAIRS.mainnet.arbitrum.chainId,
      chainIds: [CHAIN_PAIRS.mainnet.arbitrum.chainId, CHAIN_PAIRS.mainnet.avalanche.chainId],
      eids: [CHAIN_PAIRS.mainnet.arbitrum.eid, CHAIN_PAIRS.mainnet.avalanche.eid],
      channelId: 4294967295,
      wntTargetBalance: expandDecimals(5, 14),
    };
  } else if (network === "avalanche") {
    chainConfig = {
      currentChainId: CHAIN_PAIRS.mainnet.avalanche.chainId,
      chainIds: [CHAIN_PAIRS.mainnet.arbitrum.chainId, CHAIN_PAIRS.mainnet.avalanche.chainId],
      eids: [CHAIN_PAIRS.mainnet.arbitrum.eid, CHAIN_PAIRS.mainnet.avalanche.eid],
      channelId: 4294967295,
      wntTargetBalance: expandDecimals(1, 17),
    };
  } else {
    throw new Error(`Network ${network} not configured`);
  }

  await configureContracts(chainConfig);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
