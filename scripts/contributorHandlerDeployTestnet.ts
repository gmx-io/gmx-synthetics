import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { Contract, ContractFactory } from "ethers";
import { hashString } from "../utils/hash";

type NetworkConfig = {
  chainId: number;
  creForwarder: string;
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
  const checkpointPath = path.join(__dirname, `../deployments/checkpoint-ContributorHandler-${network}.json`);
  fs.writeFileSync(checkpointPath, JSON.stringify({ step, contracts }, null, 2));
  console.log(`Checkpoint saved at step ${step}`);
}

function loadCheckpoint(): DeploymentCheckpoint | null {
  const network = process.env.HARDHAT_NETWORK || "localhost";
  const checkpointPath = path.join(__dirname, `../deployments/checkpoint-ContributorHandler-${network}.json`);
  if (fs.existsSync(checkpointPath)) {
    return JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
  }
  return null;
}

function clearCheckpoint() {
  const network = process.env.HARDHAT_NETWORK || "localhost";
  const checkpointPath = path.join(__dirname, `../deployments/checkpoint-ContributorHandler-${network}.json`);
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
    creForwarder: "TBD",
  },
  arbitrumSepolia: {
    chainId: 421614,
    creForwarder: "0x76c9cf548b4179F8901cda1f8623568b58215E62",
  },
  baseSepolia: {
    chainId: 84532,
    creForwarder: "0xF8344CFd5c43616a4366C34E3EEE75af79a74482",
  },
  arbitrum: {
    chainId: 42161,
    creForwarder: "0xF8344CFd5c43616a4366C34E3EEE75af79a74482",
  },
  avalanche: {
    chainId: 43114,
    creForwarder: "0x76c9cf548b4179F8901cda1f8623568b58215E62",
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

    const EventHandler: ContractFactory = await getFactory(deployer, "EventHandler");
    const eventHandler: Contract = await EventHandler.deploy(roleStore.address, eventEmitter.address);
    await eventHandler.deployed();
    console.log("EventHandler deployed to:", eventHandler.address);
    contracts.eventHandler = eventHandler.address;
    await delay(txDelay);

    saveCheckpoint(1, contracts);
  }

  // Deploy tokens
  if (!checkpoint || checkpoint.step < 2) {
    console.log("\n2. Deploying tokens...");

    const MintableToken: ContractFactory = await getFactory(deployer, "MintableToken");

    const gmx: Contract = await MintableToken.deploy("GMX", "GMX", 18);
    await gmx.deployed();
    console.log("GMX deployed to:", gmx.address);
    contracts.gmx = gmx.address;
    await delay(txDelay);

    const usdc: Contract = await MintableToken.deploy("USDC", "USDC", 6);
    await usdc.deployed();
    console.log("USDC deployed to:", usdc.address);
    contracts.usdc = usdc.address;
    await delay(txDelay);

    saveCheckpoint(2, contracts);
  }

  // Deploy ContributorHandler and CreReceiver contracts
  if (!checkpoint || checkpoint.step < 3) {
    console.log("\n3. Deploying ContributorHandler...");

    const ContributorHandler: ContractFactory = await getFactory(deployer, "ContributorHandler");
    const contributorHandler: Contract = await ContributorHandler.deploy(
      contracts.roleStore,
      contracts.dataStore,
      contracts.eventEmitter
    );
    await contributorHandler.deployed();
    console.log("ContributorHandler deployed to:", contributorHandler.address);
    contracts.contributorHandler = contributorHandler.address;
    await delay(txDelay);

    const CreReceiver: ContractFactory = await getFactory(deployer, "CreReceiver");
    const creReceiver: Contract = await CreReceiver.deploy(
      contracts.roleStore,
      contracts.dataStore,
      contracts.eventHandler
    );
    await creReceiver.deployed();
    console.log("CreReceiver deployed to:", creReceiver.address);
    contracts.creReceiver = creReceiver.address;
    await delay(txDelay);

    saveCheckpoint(3, contracts);
  }

  // Grant remaining roles
  if (!checkpoint || checkpoint.step < 4) {
    console.log("\n4. Granting remaining roles...");

    const RoleStoreContract = await getFactory(deployer, "RoleStore");
    const roleStore = RoleStoreContract.attach(contracts.roleStore);
    await (await roleStore.grantRole(deployerAddress, hashString("CONTROLLER"))).wait();
    await delay(txDelay);
    await (await roleStore.grantRole(deployerAddress, hashString("TIMELOCK_ADMIN"))).wait();
    await delay(txDelay);
    await (await roleStore.grantRole(deployerAddress, hashString("CONTRIBUTOR_KEEPER"))).wait();
    await delay(txDelay);
    await (await roleStore.grantRole(deployerAddress, hashString("CONTRIBUTOR_DISTRIBUTOR"))).wait();
    await delay(txDelay);
    await (await roleStore.grantRole(deployerAddress, hashString("CRE_KEEPER"))).wait();
    await delay(txDelay);
    await (await roleStore.grantRole(config.creForwarder, hashString("CRE_FORWARDER"))).wait();
    await delay(txDelay);
    await (await roleStore.grantRole(contracts.contributorHandler, hashString("CONTROLLER"))).wait();
    await delay(txDelay);
    await (await roleStore.grantRole(contracts.creReceiver, hashString("CONTRIBUTOR_DISTRIBUTOR"))).wait();
    await delay(txDelay);
    await (await roleStore.grantRole(contracts.creReceiver, hashString("EVENT_CONTROLLER"))).wait();
    await delay(txDelay);
    await (await roleStore.grantRole(contracts.eventHandler, hashString("CONTROLLER"))).wait();
    await delay(txDelay);

    console.log("Roles granted successfully");

    saveCheckpoint(4, contracts);
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

  const filename = `deployment-ContributorHandler-${network}-${Date.now()}.json`;
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
