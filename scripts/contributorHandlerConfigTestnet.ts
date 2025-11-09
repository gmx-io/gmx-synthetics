import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { Contract, ContractFactory, BigNumber, constants } from "ethers";

import { daysInSeconds } from "../utils/contributorHandler";
import * as keys from "../utils/keys";
import { expandDecimals } from "../utils/math";

type DeploymentData = {
  network: string;
  timestamp: string;
  deployer: string;
  contracts: {
    [key: string]: string;
  };
  config: any;
};

const user1Key = process.env.USER1_KEY;
if (!user1Key) {
  throw new Error("USER1_KEY not set in .env file");
}
const user1 = new ethers.Wallet(user1Key, ethers.provider);

const user2Key = process.env.USER2_KEY;
if (!user2Key) {
  throw new Error("USER2_KEY not set in .env file");
}
const user2 = new ethers.Wallet(user2Key, ethers.provider);

const user3Key = process.env.USER3_KEY;
if (!user3Key) {
  throw new Error("USER3_KEY not set in .env file");
}
const user3 = new ethers.Wallet(user3Key, ethers.provider);

const gmxFundingAccountKey = process.env.GMX_FUNDING_ACCOUNT_KEY;
if (!gmxFundingAccountKey) {
  throw new Error("GMX_FUNDING_ACCOUNT_KEY not set in .env file");
}
const gmxFundingAccount = new ethers.Wallet(gmxFundingAccountKey, ethers.provider);

const usdcFundingAccountKey = process.env.USDC_FUNDING_ACCOUNT_KEY;
if (!usdcFundingAccountKey) {
  throw new Error("USDC_FUNDING_ACCOUNT_KEY not set in .env file");
}
const usdcFundingAccount = new ethers.Wallet(usdcFundingAccountKey, ethers.provider);

const resetContributorLastPaymentAtStr = process.env.RESET_CONTRIBUTOR_LAST_PAYMENT_AT;
if (!resetContributorLastPaymentAtStr) {
  throw new Error("RESET_CONTRIBUTOR_LAST_PAYMENT_AT environment variable not provided");
}
if (resetContributorLastPaymentAtStr !== "true" && resetContributorLastPaymentAtStr !== "false") {
  throw new Error('RESET_CONTRIBUTOR_LAST_PAYMENT_AT environment must equal "true" or "false"');
}
const resetContributorLastPaymentAt = resetContributorLastPaymentAtStr === "true";

const setupDataStr = process.env.SETUP_DATA;
if (!setupDataStr) {
  throw new Error("SETUP_DATA environment variable not provided");
}
if (setupDataStr !== "true" && setupDataStr !== "false") {
  throw new Error('SETUP_DATA environment must equal "true" or "false"');
}
const setupData = setupDataStr === "true";

const ZERO = BigNumber.from(0);

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

async function loadDeployment(network: string): Promise<DeploymentData | null> {
  const deploymentsDir = path.join(__dirname, "../deployments");

  if (!fs.existsSync(deploymentsDir)) {
    return null;
  }

  const files = fs.readdirSync(deploymentsDir);

  const searchPattern = `deployment-ContributorHandler-${network}-`;
  const deploymentFiles = files.filter((f) => f.startsWith(searchPattern));

  if (deploymentFiles.length === 0) {
    return null;
  }

  deploymentFiles.sort();
  const latestFile = deploymentFiles[deploymentFiles.length - 1];

  console.log(`Loading deployment from ${latestFile}`);
  return JSON.parse(fs.readFileSync(path.join(deploymentsDir, latestFile), "utf8"));
}

async function configureContracts(nativeTokenTargetBalance: BigNumber) {
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const network = process.env.HARDHAT_NETWORK || "localhost";

  const txDelay = 1000;

  console.log("\nConfiguring contracts");
  console.log("Network:", network);
  console.log("Account:", deployerAddress);
  if (setupData) {
    console.log(`Will setup test data: ${setupData}\n`);
  }

  // Load current deployment
  const deployment = await loadDeployment(network);
  if (!deployment) {
    throw new Error(`No deployment found for ${network}`);
  }
  const contracts = deployment.contracts;

  // Get contract instances
  const DataStore: ContractFactory = await getFactory(deployer, "DataStore");
  const dataStore: Contract = DataStore.attach(contracts.dataStore);

  const ContributorHandler: ContractFactory = await getFactory(deployer, "ContributorHandler");
  const contributorHandler: Contract = ContributorHandler.attach(contracts.contributorHandler);

  const MintableToken = await getFactory(deployer, "MintableToken");
  const gmx = MintableToken.attach(contracts.gmx);
  const usdc = MintableToken.attach(contracts.usdc);

  if (setupData) {
    console.log("\nSetting up test data");

    await (
      await dataStore.setBool(
        keys.creReceiverAuthorizedWorkflowIdsKey("0x00de77814a7cdb51dc27e457a5b8d3b2fa5c4ae9ed676d09bbbeb5822bfd1da6"),
        true
      )
    ).wait();
    await delay(txDelay);
    await (await contributorHandler.addContributorAccount(user1.address)).wait();
    await delay(txDelay);
    await (await contributorHandler.addContributorAccount(user2.address)).wait();
    await delay(txDelay);
    await (await contributorHandler.addContributorAccount(user3.address)).wait();
    await delay(txDelay);

    await (await contributorHandler.addContributorToken(gmx.address)).wait();
    await delay(txDelay);
    await (await contributorHandler.addContributorToken(usdc.address)).wait();
    await delay(txDelay);

    await (await contributorHandler.setContributorFundingAccount(gmx.address, gmxFundingAccount.address)).wait();
    await delay(txDelay);
    await (await contributorHandler.setContributorFundingAccount(usdc.address, usdcFundingAccount.address)).wait();
    await delay(txDelay);

    await (await contributorHandler.setMinContributorPaymentInterval(daysInSeconds(28))).wait();
    await delay(txDelay);

    const maxGmxAmount = expandDecimals(10_000, 18);
    const maxUsdcAmount = expandDecimals(100_000, 6);
    await (
      await contributorHandler.setMaxTotalContributorTokenAmount(
        [gmx.address, usdc.address],
        [maxGmxAmount, maxUsdcAmount]
      )
    ).wait();
    await delay(txDelay);

    const user1GmxAmount = expandDecimals(50, 18);
    const user1UsdcAmount = expandDecimals(8_000, 6);
    const user2GmxAmount = expandDecimals(30, 18);
    const user3UsdcAmount = expandDecimals(7_000, 6);
    await (
      await contributorHandler.setContributorAmount(
        user1.address,
        [gmx.address, usdc.address],
        [user1GmxAmount, user1UsdcAmount]
      )
    ).wait();
    await delay(txDelay);
    await (await contributorHandler.setContributorAmount(user2.address, [gmx.address], [user2GmxAmount])).wait();
    await delay(txDelay);
    await (await contributorHandler.setContributorAmount(user3.address, [usdc.address], [user3UsdcAmount])).wait();
    await delay(txDelay);

    // Fund accounts with native token for approval then return to deployer
    console.log("Native token send amount: ", ethers.utils.formatEther(nativeTokenTargetBalance));
    await (
      await deployer.sendTransaction({
        to: gmxFundingAccount.address,
        value: nativeTokenTargetBalance,
      })
    ).wait();
    console.log(`Funded gmxFundingAccount with ${ethers.utils.formatEther(nativeTokenTargetBalance)} native token`);
    await delay(txDelay);
    await (await gmx.connect(gmxFundingAccount).approve(contracts.contributorHandler, constants.MaxUint256)).wait();
    await delay(txDelay);

    console.log("Native token send amount: ", ethers.utils.formatEther(nativeTokenTargetBalance));
    await (
      await deployer.sendTransaction({
        to: usdcFundingAccount.address,
        value: nativeTokenTargetBalance,
      })
    ).wait();
    console.log(`Funded usdcFundingAccount with ${ethers.utils.formatEther(nativeTokenTargetBalance)} native token`);
    await delay(txDelay);
    await (await usdc.connect(usdcFundingAccount).approve(contracts.contributorHandler, constants.MaxUint256)).wait();
    await delay(txDelay);
  }

  // Reset distribution timestamp if resetContributorLastPaymentAt = true
  if (resetContributorLastPaymentAt) {
    await dataStore.setUint(keys.CONTRIBUTOR_LAST_PAYMENT_AT, 0);
    await delay(txDelay);
  }

  console.log("\nReset test data");

  let currentBalance = await gmx.balanceOf(user1.address);
  if (currentBalance > ZERO) {
    await (await gmx.burn(user1.address, currentBalance)).wait();
    console.log(`Burned user1 GMX: ${ethers.utils.formatEther(currentBalance)}`);
    await delay(txDelay);
  }
  currentBalance = await usdc.balanceOf(user1.address);
  if (currentBalance > ZERO) {
    await (await usdc.burn(user1.address, currentBalance)).wait();
    console.log(`Burned user1 USDC: ${ethers.utils.formatUnits(currentBalance, 6)}`);
    await delay(txDelay);
  }

  currentBalance = await gmx.balanceOf(user2.address);
  if (currentBalance > ZERO) {
    await (await gmx.burn(user2.address, currentBalance)).wait();
    console.log(`Burned user2 GMX: ${ethers.utils.formatEther(currentBalance)}`);
    await delay(txDelay);
  }

  currentBalance = await usdc.balanceOf(user3.address);
  if (currentBalance > ZERO) {
    await (await usdc.burn(user3.address, currentBalance)).wait();
    console.log(`Burned user3 USDC: ${ethers.utils.formatUnits(currentBalance, 6)}`);
    await delay(txDelay);
  }

  currentBalance = await gmx.balanceOf(gmxFundingAccount.address);
  console.log("Current GMX Funding Account GMX balance: ", ethers.utils.formatEther(currentBalance));
  const gmxTargetBalance = expandDecimals(80, 18);
  const gmxMintAmount = gmxTargetBalance.sub(currentBalance);
  if (gmxMintAmount > ZERO) {
    console.log("GMX mint amount: ", ethers.utils.formatEther(gmxMintAmount));
    await (await gmx.mint(gmxFundingAccount.address, gmxMintAmount)).wait();
    console.log(
      `Funded GMX Funding Account with ${ethers.utils.formatEther(
        gmxMintAmount
      )} GMX for gas for a total of ${ethers.utils.formatEther(gmxTargetBalance)} GMX`
    );
    await delay(txDelay);
  }

  currentBalance = await usdc.balanceOf(usdcFundingAccount.address);
  console.log("Current USDC Funding Account USDC balance: ", ethers.utils.formatUnits(currentBalance, 6));
  const usdcTargetBalance = expandDecimals(15000, 6);
  const usdcMintAmount = usdcTargetBalance.sub(currentBalance);
  if (usdcMintAmount > ZERO) {
    console.log("USDC mint amount: ", ethers.utils.formatUnits(usdcMintAmount, 6));
    await (await usdc.mint(usdcFundingAccount.address, usdcMintAmount)).wait();
    console.log(
      `Funded USDC Funding Account with ${ethers.utils.formatUnits(
        usdcMintAmount,
        6
      )} USDC for gas for a total of ${ethers.utils.formatUnits(usdcTargetBalance, 6)} USDC`
    );
    await delay(txDelay);
  }

  console.log("\nConfiguration complete!");
}

// Run configuration
async function main(): Promise<void> {
  const network = process.env.HARDHAT_NETWORK || "localhost";

  let nativeTokenTargetBalance: BigNumber;

  if (network === "localhost") {
    nativeTokenTargetBalance = expandDecimals(1, 16);
  } else if (network === "arbitrumSepolia") {
    nativeTokenTargetBalance = expandDecimals(1, 16);
  } else if (network === "baseSepolia") {
    nativeTokenTargetBalance = expandDecimals(1, 16);
  } else if (network === "arbitrum") {
    nativeTokenTargetBalance = expandDecimals(1, 16);
  } else if (network === "avalanche") {
    nativeTokenTargetBalance = expandDecimals(1, 16);
  } else {
    throw new Error(`Network ${network} not configured`);
  }

  await configureContracts(nativeTokenTargetBalance);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
