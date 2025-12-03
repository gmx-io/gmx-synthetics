import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { Contract, ContractFactory } from "ethers";
import { hashString } from "../utils/hash";
import { expandDecimals } from "../utils/math";

const DEPLOYMENT_TAG = process.env.DEPLOYMENT_TAG;
if (!DEPLOYMENT_TAG) {
  throw new Error("Environment variable DEPLOYMENT_TAG not set");
}
if (DEPLOYMENT_TAG !== "chainA" && DEPLOYMENT_TAG !== "chainB") {
  throw new Error('Environment variable DEPLOYMENT_TAG must equal "chainA" or "chainB"');
}

type NetworkConfig = {
  chainId: number;
  eid: number;
  counterEid: number;
  channelId: number;
  lzEndpoint?: string;
};

type DeploymentResult = {
  network: string;
  timestamp: string;
  deployer: string;
  contracts: {
    [key: string]: string;
  };
  config: NetworkConfig;
};

type DeploymentCheckpoint = {
  step: number;
  contracts: { [key: string]: string };
};

function saveCheckpoint(step: number, contracts: { [key: string]: string }) {
  const network = process.env.HARDHAT_NETWORK || "localhost";
  const checkpointPath = path.join(
    __dirname,
    `../deployments/checkpoint-${network}${DEPLOYMENT_TAG ? `-${DEPLOYMENT_TAG}` : ""}.json`
  );
  fs.writeFileSync(checkpointPath, JSON.stringify({ step, contracts }, null, 2));
  console.log(`Checkpoint saved at step ${step}`);
}

function loadCheckpoint(): DeploymentCheckpoint | null {
  const network = process.env.HARDHAT_NETWORK || "localhost";
  const checkpointPath = path.join(
    __dirname,
    `../deployments/checkpoint-${network}${DEPLOYMENT_TAG ? `-${DEPLOYMENT_TAG}` : ""}.json`
  );
  if (fs.existsSync(checkpointPath)) {
    return JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
  }
  return null;
}

function clearCheckpoint() {
  const network = process.env.HARDHAT_NETWORK || "localhost";
  const checkpointPath = path.join(
    __dirname,
    `../deployments/checkpoint-${network}${DEPLOYMENT_TAG ? `-${DEPLOYMENT_TAG}` : ""}.json`
  );
  if (fs.existsSync(checkpointPath)) {
    fs.unlinkSync(checkpointPath);
    console.log("Checkpoint cleared");
  }
}

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const NETWORK_CONFIG: { [key: string]: NetworkConfig } = {
  localhost: {
    chainId: 31337,
    eid: DEPLOYMENT_TAG === "chainA" ? 1000 : 2000,
    counterEid: DEPLOYMENT_TAG === "chainA" ? 2000 : 1000,
    channelId: 1001,
    // No lzEndpoint - will deploy mock
  },
  arbitrumSepolia: {
    chainId: 421614,
    eid: 40231,
    counterEid: 40245,
    channelId: 4294967295,
    lzEndpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f", // LayerZero V2 Endpoint on Arbitrum Sepolia
  },
  baseSepolia: {
    chainId: 84532,
    eid: 40245,
    counterEid: 40231,
    channelId: 4294967295,
    lzEndpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f", // LayerZero V2 Endpoint on Base Sepolia
  },
  arbitrum: {
    chainId: 42161,
    eid: 30110,
    counterEid: 30106,
    channelId: 4294967295,
    lzEndpoint: "0x1a44076050125825900e736c501f859c50fE728c", // LayerZero V2 Endpoint on Arbitrum
  },
  avalanche: {
    chainId: 43114,
    eid: 30106,
    counterEid: 30110,
    channelId: 4294967295,
    lzEndpoint: "0x1a44076050125825900e736c501f859c50fE728c", // LayerZero V2 Endpoint on Avalanche
  },
};

async function getFactory(deployer: ethers.SignerWithAddress, contractName: string, libraries?: any) {
  if (libraries) {
    return await ethers.getContractFactory(contractName, {
      signer: deployer,
      libraries: libraries.libraries || libraries,
    });
  }
  return await ethers.getContractFactory(contractName, deployer);
}

async function deployContracts(): Promise<DeploymentResult> {
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  console.log("Deploying contracts with account:", deployerAddress);

  const network = process.env.HARDHAT_NETWORK || "localhost";
  const config = NETWORK_CONFIG[network];

  if (!config) {
    throw new Error(`Network ${network} not configured`);
  }

  console.log(`Deploying on network: ${network}`);
  console.log("Config:", config);

  const txDelay = network === "localhost" ? 0 : 1000;

  // Load checkpoint if exists
  const checkpoint = loadCheckpoint();
  const contracts: { [key: string]: string } = checkpoint?.contracts || {};

  if (checkpoint) {
    console.log(`\n Resuming from checkpoint (step ${checkpoint.step})`);
  }

  // Deploy core infrastructure
  if (!checkpoint || checkpoint.step < 1) {
    console.log("\n1. Deploying core infrastructure...");

    // RoleStore
    const RoleStore: ContractFactory = await getFactory(deployer, "RoleStore");
    const roleStore: Contract = await RoleStore.deploy();
    await roleStore.deployed();
    console.log("RoleStore deployed to:", roleStore.address);
    contracts.roleStore = roleStore.address;
    await delay(txDelay);

    // DataStore
    const DataStore: ContractFactory = await getFactory(deployer, "DataStore");
    const dataStore: Contract = await DataStore.deploy(roleStore.address);
    await dataStore.deployed();
    console.log("DataStore deployed to:", dataStore.address);
    contracts.dataStore = dataStore.address;
    await delay(txDelay);

    // EventEmitter
    const EventEmitter: ContractFactory = await getFactory(deployer, "EventEmitter");
    const eventEmitter: Contract = await EventEmitter.deploy(roleStore.address);
    await eventEmitter.deployed();
    console.log("EventEmitter deployed to:", eventEmitter.address);
    contracts.eventEmitter = eventEmitter.address;
    await delay(txDelay);

    // Grant roles early for configuration
    await (await roleStore.grantRole(deployerAddress, hashString("CONTROLLER"))).wait();
    await delay(txDelay);
    await (await roleStore.grantRole(deployerAddress, hashString("TIMELOCK_ADMIN"))).wait();
    await delay(txDelay);
    await (await roleStore.grantRole(deployerAddress, hashString("FEE_DISTRIBUTION_KEEPER"))).wait();
    await delay(txDelay);
    await (await roleStore.grantRole(deployerAddress, hashString("CONFIG_KEEPER"))).wait();
    await delay(txDelay);

    saveCheckpoint(1, contracts);
  }

  // Deploy libraries
  if (!checkpoint || checkpoint.step < 2) {
    console.log("\n2. Deploying libraries...");

    const MarketEventUtils: ContractFactory = await getFactory(deployer, "MarketEventUtils");
    const marketEventUtils: Contract = await MarketEventUtils.deploy();
    await marketEventUtils.deployed();
    console.log("MarketEventUtils deployed to:", marketEventUtils.address);
    contracts.marketEventUtils = marketEventUtils.address;
    await delay(txDelay);

    const MarketStoreUtils: ContractFactory = await getFactory(deployer, "MarketStoreUtils");
    const marketStoreUtils: Contract = await MarketStoreUtils.deploy();
    await marketStoreUtils.deployed();
    console.log("MarketStoreUtils deployed to:", marketStoreUtils.address);
    contracts.marketStoreUtils = marketStoreUtils.address;
    await delay(txDelay);

    const MarketUtils: ContractFactory = await getFactory(deployer, "MarketUtils", {
      libraries: {
        MarketEventUtils: contracts.marketEventUtils,
        MarketStoreUtils: contracts.marketStoreUtils,
      },
    });
    const marketUtils: Contract = await MarketUtils.deploy();
    await marketUtils.deployed();
    console.log("MarketUtils deployed to:", marketUtils.address);
    contracts.marketUtils = marketUtils.address;
    await delay(txDelay);

    const ConfigUtils: ContractFactory = await getFactory(deployer, "ConfigUtils", {
      libraries: {
        MarketUtils: contracts.marketUtils,
      },
    });
    const configUtils: Contract = await ConfigUtils.deploy();
    await configUtils.deployed();
    console.log("ConfigUtils deployed to:", configUtils.address);
    contracts.configUtils = configUtils.address;
    await delay(txDelay);

    const FeeDistributorUtils: ContractFactory = await getFactory(deployer, "FeeDistributorUtils");
    const feeDistributorUtils: Contract = await FeeDistributorUtils.deploy();
    await feeDistributorUtils.deployed();
    console.log("FeeDistributorUtils deployed to:", feeDistributorUtils.address);
    contracts.feeDistributorUtils = feeDistributorUtils.address;
    await delay(txDelay);

    const ClaimUtils: ContractFactory = await getFactory(deployer, "ClaimUtils");
    const claimUtils: Contract = await ClaimUtils.deploy();
    await claimUtils.deployed();
    console.log("ClaimUtils deployed to:", claimUtils.address);
    contracts.claimUtils = claimUtils.address;
    await delay(txDelay);

    // Config
    const Config: ContractFactory = await getFactory(deployer, "Config", {
      libraries: {
        ConfigUtils: contracts.configUtils,
      },
    });
    const configContract: Contract = await Config.deploy(
      contracts.roleStore,
      contracts.dataStore,
      contracts.eventEmitter
    );
    await configContract.deployed();
    console.log("Config deployed to:", configContract.address);
    contracts.config = configContract.address;
    await delay(txDelay);

    // Grant role to config
    const RoleStoreContract = await getFactory(deployer, "RoleStore");
    const roleStore = RoleStoreContract.attach(contracts.roleStore);
    await (await roleStore.grantRole(contracts.config, hashString("CONTROLLER"))).wait();
    await delay(txDelay);

    saveCheckpoint(2, contracts);
  }

  // Deploy tokens
  if (!checkpoint || checkpoint.step < 3) {
    console.log("\n3. Deploying tokens...");

    const MintableToken: ContractFactory = await getFactory(deployer, "MintableToken");

    const gmx: Contract = await MintableToken.deploy("GMX", "GMX", 18);
    await gmx.deployed();
    console.log("GMX deployed to:", gmx.address);
    contracts.gmx = gmx.address;
    await delay(txDelay);

    const esGmx: Contract = await MintableToken.deploy("esGMX", "esGMX", 18);
    await esGmx.deployed();
    console.log("esGMX deployed to:", esGmx.address);
    contracts.esGmx = esGmx.address;
    await delay(txDelay);

    const wnt: Contract = await MintableToken.deploy("WETH", "WETH", 18);
    await wnt.deployed();
    console.log("WNT deployed to:", wnt.address);
    contracts.wnt = wnt.address;
    await delay(txDelay);

    saveCheckpoint(3, contracts);
  }

  // Deploy Oracle components
  if (!checkpoint || checkpoint.step < 4) {
    console.log("\n4. Deploying Oracle components...");

    const Oracle: ContractFactory = await getFactory(deployer, "Oracle");
    const oracle: Contract = await Oracle.deploy(
      contracts.roleStore,
      contracts.dataStore,
      contracts.eventEmitter,
      ethers.constants.AddressZero
    );
    await oracle.deployed();
    console.log("Oracle deployed to:", oracle.address);
    contracts.oracle = oracle.address;
    await delay(txDelay);

    const ChainlinkPriceFeedProvider: ContractFactory = await getFactory(deployer, "ChainlinkPriceFeedProvider");
    const chainlinkPriceFeedProvider: Contract = await ChainlinkPriceFeedProvider.deploy(contracts.dataStore);
    await chainlinkPriceFeedProvider.deployed();
    console.log("ChainlinkPriceFeedProvider deployed to:", chainlinkPriceFeedProvider.address);
    contracts.chainlinkPriceFeedProvider = chainlinkPriceFeedProvider.address;
    await delay(txDelay);

    // Grant role to price feed provider and oracle
    const RoleStoreContract = await getFactory(deployer, "RoleStore");
    const roleStore = RoleStoreContract.attach(contracts.roleStore);
    await (await roleStore.grantRole(contracts.chainlinkPriceFeedProvider, hashString("CONTROLLER"))).wait();
    await delay(txDelay);
    await (await roleStore.grantRole(contracts.oracle, hashString("CONTROLLER"))).wait();
    await delay(txDelay);

    // Deploy mock price feeds
    const WETHPriceFeed: ContractFactory = await getFactory(deployer, "MockPriceFeed");
    const wethPriceFeed: Contract = await WETHPriceFeed.deploy();
    await wethPriceFeed.deployed();
    await delay(txDelay);
    await (await wethPriceFeed.setAnswer(expandDecimals(5_000, 8))).wait(); // $5000
    console.log("WETH Price Feed deployed to:", wethPriceFeed.address);
    contracts.wethPriceFeed = wethPriceFeed.address;
    await delay(txDelay);

    const GMXPriceFeed: ContractFactory = await getFactory(deployer, "MockPriceFeed");
    const gmxPriceFeed: Contract = await GMXPriceFeed.deploy();
    await gmxPriceFeed.deployed();
    await delay(txDelay);
    await (await gmxPriceFeed.setAnswer(expandDecimals(20, 8))).wait(); // $20
    console.log("GMX Price Feed deployed to:", gmxPriceFeed.address);
    contracts.gmxPriceFeed = gmxPriceFeed.address;
    await delay(txDelay);

    saveCheckpoint(4, contracts);
  }

  // Handle endpoint deployment/configuration
  if (!checkpoint || checkpoint.step < 5) {
    console.log("\n5. Setting up LayerZero endpoint...");

    let endpointAddressForMultichainReader: string;
    let endpointAddressForGmxAdapter: string;
    let mockEndpointMultichainReader: Contract | undefined;
    let mockEndpointGmxAdapter: Contract | undefined;

    if (network === "localhost") {
      // Deploy two separate mock endpoints for localhost to avoid reentrancy issues
      const MockEndpointV2: ContractFactory = await getFactory(deployer, "MockEndpointV2");

      // First endpoint for MultichainReader
      mockEndpointMultichainReader = await MockEndpointV2.deploy(config.eid);
      await mockEndpointMultichainReader.deployed();
      endpointAddressForMultichainReader = mockEndpointMultichainReader.address;
      console.log("MockEndpointV2 for MultichainReader deployed to:", endpointAddressForMultichainReader);
      contracts.mockEndpointMultichainReader = endpointAddressForMultichainReader;
      contracts.endpointForMultichainReader = endpointAddressForMultichainReader;

      // Second endpoint for GMX Adapter to avoid reentrancy issues
      mockEndpointGmxAdapter = await MockEndpointV2.deploy(config.eid);
      await mockEndpointGmxAdapter.deployed();
      endpointAddressForGmxAdapter = mockEndpointGmxAdapter.address;
      console.log("MockEndpointV2 for GMX Adapter deployed to:", endpointAddressForGmxAdapter);
      contracts.mockEndpointGmxAdapter = endpointAddressForGmxAdapter;
      contracts.endpointForGmxAdapter = endpointAddressForGmxAdapter;
    } else {
      // Use actual LayerZero endpoint for testnets (same endpoint for both)
      if (!config.lzEndpoint) {
        throw new Error(`LayerZero endpoint not configured for ${network}`);
      }
      endpointAddressForMultichainReader = config.lzEndpoint;
      endpointAddressForGmxAdapter = config.lzEndpoint;
      console.log("Using LayerZero endpoint at:", config.lzEndpoint);
      contracts.endpointForMultichainReader = endpointAddressForMultichainReader;
      contracts.endpointForGmxAdapter = endpointAddressForGmxAdapter;
      contracts.mockEndpointMultichainReader = "N/A";
      contracts.mockEndpointGmxAdapter = "N/A";
    }

    saveCheckpoint(5, contracts);
  }

  // Deploy other mock contracts
  if (!checkpoint || checkpoint.step < 6) {
    console.log("\n6. Deploying mock contracts...");

    const MockVaultV1: ContractFactory = await getFactory(deployer, "MockVaultV1");
    const mockVaultV1: Contract = await MockVaultV1.deploy(deployerAddress);
    await mockVaultV1.deployed();
    console.log("MockVaultV1 deployed to:", mockVaultV1.address);
    contracts.mockVaultV1 = mockVaultV1.address;
    await delay(txDelay);

    const MockRewardDistributorV1: ContractFactory = await getFactory(deployer, "MockRewardDistributorV1");
    const mockRewardDistributor: Contract = await MockRewardDistributorV1.deploy();
    await mockRewardDistributor.deployed();
    console.log("MockRewardDistributorV1 deployed to:", mockRewardDistributor.address);
    contracts.mockRewardDistributor = mockRewardDistributor.address;
    await delay(txDelay);

    const MockRewardTrackerV1: ContractFactory = await getFactory(deployer, "MockRewardTrackerV1");
    const mockExtendedGmxTracker: Contract = await MockRewardTrackerV1.deploy(contracts.mockRewardDistributor);
    await mockExtendedGmxTracker.deployed();
    console.log("MockRewardTrackerV1 deployed to:", mockExtendedGmxTracker.address);
    contracts.mockExtendedGmxTracker = mockExtendedGmxTracker.address;
    await delay(txDelay);

    const MockVesterV1: ContractFactory = await getFactory(deployer, "MockVesterV1");
    const mockVester: Contract = await MockVesterV1.deploy([deployerAddress], [expandDecimals(1, 18)]);
    await mockVester.deployed();
    console.log("MockVesterV1 deployed to:", mockVester.address);
    contracts.mockVester = mockVester.address;
    await delay(txDelay);

    saveCheckpoint(6, contracts);
  }

  // Deploy fee-related contracts
  if (!checkpoint || checkpoint.step < 7) {
    console.log("\n7. Deploying fee contracts...");

    const FeeVault: ContractFactory = await getFactory(deployer, "FeeVault");
    const feeVault: Contract = await FeeVault.deploy(contracts.roleStore, contracts.dataStore);
    await feeVault.deployed();
    console.log("FeeVault deployed to:", feeVault.address);
    contracts.feeVault = feeVault.address;
    await delay(txDelay);

    const FeeHandler: ContractFactory = await getFactory(deployer, "FeeHandler", {
      libraries: {
        MarketUtils: contracts.marketUtils,
      },
    });
    const feeHandler: Contract = await FeeHandler.deploy(
      contracts.roleStore,
      contracts.dataStore,
      contracts.eventEmitter,
      feeVault.address,
      contracts.mockVaultV1,
      contracts.gmx
    );
    await feeHandler.deployed();
    console.log("FeeHandler deployed to:", feeHandler.address);
    contracts.feeHandler = feeHandler.address;
    await delay(txDelay);

    const FeeDistributorVault: ContractFactory = await getFactory(deployer, "FeeDistributorVault");
    const feeDistributorVault: Contract = await FeeDistributorVault.deploy(contracts.roleStore, contracts.dataStore);
    await feeDistributorVault.deployed();
    console.log("FeeDistributorVault deployed to:", feeDistributorVault.address);
    contracts.feeDistributorVault = feeDistributorVault.address;
    await delay(txDelay);

    const ClaimVault: ContractFactory = await getFactory(deployer, "ClaimVault");
    const claimVault: Contract = await ClaimVault.deploy(contracts.roleStore, contracts.dataStore);
    await claimVault.deployed();
    console.log("ClaimVault deployed to:", claimVault.address);
    contracts.claimVault = claimVault.address;
    await delay(txDelay);

    // Deploy MultichainReader with its dedicated endpoint
    const MultichainReader: ContractFactory = await getFactory(deployer, "MultichainReader");
    const multichainReader: Contract = await MultichainReader.deploy(
      contracts.roleStore,
      contracts.dataStore,
      contracts.eventEmitter,
      contracts.endpointForMultichainReader
    );
    await multichainReader.deployed();
    console.log("MultichainReader deployed to:", multichainReader.address);
    contracts.multichainReader = multichainReader.address;
    await delay(txDelay);

    const MockGMXAdapter: ContractFactory = await getFactory(deployer, "MockGMX_MintBurnAdapter");
    const gmxAdapter = await MockGMXAdapter.deploy(
      [{ dstEid: config.counterEid, limit: expandDecimals(1000000, 18), window: 60 }],
      contracts.gmx,
      contracts.endpointForGmxAdapter,
      deployerAddress
    );
    await gmxAdapter.deployed();
    console.log("MockGMX_MintBurnAdapter deployed to:", gmxAdapter.address);
    contracts.gmxAdapter = gmxAdapter.address;
    await delay(txDelay);

    saveCheckpoint(7, contracts);
  }

  // Deploy FeeDistributor
  if (!checkpoint || checkpoint.step < 8) {
    console.log("\n8. Deploying FeeDistributor...");

    const FeeDistributor: ContractFactory = await getFactory(deployer, "FeeDistributor", {
      libraries: {
        FeeDistributorUtils: contracts.feeDistributorUtils,
        ClaimUtils: contracts.claimUtils,
      },
    });
    const feeDistributor: Contract = await FeeDistributor.deploy(
      contracts.roleStore,
      contracts.feeDistributorVault,
      contracts.feeHandler,
      contracts.dataStore,
      contracts.eventEmitter,
      contracts.multichainReader,
      contracts.claimVault,
      contracts.gmx,
      contracts.esGmx,
      contracts.wnt
    );
    await feeDistributor.deployed();
    console.log("FeeDistributor deployed to:", feeDistributor.address);
    contracts.feeDistributor = feeDistributor.address;
    await delay(txDelay);

    saveCheckpoint(8, contracts);
  }

  // Grant remaining roles
  if (!checkpoint || checkpoint.step < 9) {
    console.log("\n9. Granting remaining roles...");

    const RoleStoreContract = await getFactory(deployer, "RoleStore");
    const roleStore = RoleStoreContract.attach(contracts.roleStore);
    await (await roleStore.grantRole(contracts.feeDistributor, hashString("CONTROLLER"))).wait();
    await delay(txDelay);
    await (await roleStore.grantRole(contracts.feeDistributor, hashString("FEE_KEEPER"))).wait();
    await delay(txDelay);
    await (await roleStore.grantRole(contracts.multichainReader, hashString("CONTROLLER"))).wait();
    await delay(txDelay);
    await (await roleStore.grantRole(contracts.multichainReader, hashString("MULTICHAIN_READER"))).wait();
    await delay(txDelay);
    await (await roleStore.grantRole(contracts.feeHandler, hashString("CONTROLLER"))).wait();
    await delay(txDelay);
    await (await roleStore.grantRole(contracts.feeDistributorVault, hashString("CONTROLLER"))).wait();
    await delay(txDelay);

    console.log("Roles granted successfully");

    saveCheckpoint(9, contracts);
  }

  // Clear checkpoint after successful deployment
  clearCheckpoint();

  // Save deployment addresses
  const deployment: DeploymentResult = {
    network: network,
    timestamp: new Date().toISOString(),
    deployer: deployerAddress,
    contracts: contracts,
    config: config,
  };

  const deploymentsDir = path.join(__dirname, "../deployments");

  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir);
  }

  const filename = `deployment-${network}${DEPLOYMENT_TAG ? `-${DEPLOYMENT_TAG}` : ""}-${Date.now()}.json`;
  fs.writeFileSync(path.join(deploymentsDir, filename), JSON.stringify(deployment, null, 2));

  console.log(`\nDeployment saved to deployments/${filename}`);

  return deployment;
}

// Run deployment
deployContracts()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
