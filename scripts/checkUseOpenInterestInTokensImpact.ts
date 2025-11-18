/**
 * Script to check the impact on GM token prices if USE_OPEN_INTEREST_IN_TOKENS_FOR_BALANCE is set to true
 *
 * This script simulates what would happen to GM token prices across all markets if the
 * USE_OPEN_INTEREST_IN_TOKENS_FOR_BALANCE setting is changed. This setting affects which
 * side pays borrowing fees, which can impact the pool value and thus the GM token price.
 *
 * IMPORTANT: This script REQUIRES Anvil to be running because it:
 * - Impersonates a CONTROLLER account
 * - Modifies contract state (sets USE_OPEN_INTEREST_IN_TOKENS_FOR_BALANCE)
 * - Compares prices before/after the change
 * - Restores the original setting
 *
 * Usage:
 *   For Arbitrum:
 *     Terminal 1: source .env && anvil --fork-url $ARBITRUM_RPC_URL --host 127.0.0.1 --port 8545
 *     Terminal 2: npx hardhat run scripts/checkUseOpenInterestInTokensImpact.ts --network anvil
 *
 *   For Avalanche:
 *     Terminal 1: source .env && anvil --fork-url $AVALANCHE_RPC_URL --host 127.0.0.1 --port 8545
 *     Terminal 2: FORK=avalanche FORK_ID=43114 npx hardhat run scripts/checkUseOpenInterestInTokensImpact.ts --network anvil
 */

import hre, { ethers } from "hardhat";
import { BigNumber } from "ethers";
import * as path from "path";
import * as fs from "fs";
import { bigNumberify, formatAmount } from "../utils/math";
import { hashString } from "../utils/hash";
import { MAX_PNL_FACTOR_FOR_TRADERS } from "../utils/keys";
import fetch from "node-fetch";

// Keys not in main utils/keys.ts
const USE_OPEN_INTEREST_IN_TOKENS_FOR_BALANCE = hashString("USE_OPEN_INTEREST_IN_TOKENS_FOR_BALANCE");
const CONTROLLER = hashString("CONTROLLER");

async function fetchTickerPrices(network: string) {
  console.log("Fetching token prices...");

  const apiNetwork = network === "anvil" ? process.env.FORK || "arbitrum" : network;
  const tickersUrl = `https://${apiNetwork}-api.gmxinfra2.io/prices/tickers`;

  const tokenPricesResponse = await fetch(tickersUrl);
  const tokenPrices = await tokenPricesResponse.json();
  const pricesByTokenAddress: any = {};

  for (const tokenPrice of tokenPrices) {
    pricesByTokenAddress[tokenPrice.tokenAddress.toLowerCase()] = {
      min: bigNumberify(tokenPrice.minPrice),
      max: bigNumberify(tokenPrice.maxPrice),
    };
  }

  return pricesByTokenAddress;
}

async function getTokenSymbol(address: string): Promise<string> {
  if (address === ethers.constants.AddressZero) {
    return "SPOT";
  }

  try {
    const token = await ethers.getContractAt(["function symbol() view returns (string)"], address);
    return await token.symbol();
  } catch (error) {
    // If symbol() fails, return shortened address
    return address.substring(0, 8);
  }
}

function getTokenPrice({ token, pricesByTokenAddress }: any) {
  if (token === ethers.constants.AddressZero) {
    throw new Error("Price for zero address");
  }
  return pricesByTokenAddress[token.toLowerCase()];
}

async function getContracts(network: string) {
  function getDeployedAddress(contractName: string): string {
    const deploymentPath = path.join(deploymentsPath, `${contractName}.json`);
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    return deployment.address;
  }

  // For anvil, use FORK env var to determine which deployments to use (defaults to arbitrum)
  const deploymentNetwork = network === "anvil" ? process.env.FORK || "arbitrum" : network;
  const deploymentsPath = path.join(__dirname, `../deployments/${deploymentNetwork}`);
  const dataStore = await ethers.getContractAt("DataStore", getDeployedAddress("DataStore"));
  const reader = await ethers.getContractAt("Reader", getDeployedAddress("Reader"));
  const roleStore = await ethers.getContractAt("RoleStore", getDeployedAddress("RoleStore"));

  return { dataStore, reader, roleStore };
}

async function getController(roleStore: any) {
  // Get accounts with CONTROLLER role (required for setBool)
  const controllers = await roleStore.getRoleMembers(CONTROLLER, 0, 10);

  const controller = controllers[0];
  console.log(`Impersonating CONTROLLER: ${controller}`);

  // Impersonate using Anvil RPC - need direct provider to bypass Hardhat's account checks
  const anvilProvider = new ethers.providers.JsonRpcProvider("http://127.0.0.1:8545");
  await anvilProvider.send("anvil_impersonateAccount", [controller]);

  // Give the impersonated account some ETH for gas
  await anvilProvider.send("anvil_setBalance", [controller, "0x1000000000000000000"]);

  // Get an unchecked signer from the direct provider (this is the key!)
  return anvilProvider.getUncheckedSigner(controller);
}

interface MarketPriceData {
  marketToken: string;
  marketLabel: string;
  price: BigNumber;
  error?: string;
}

async function getMarketPrices(
  markets: any[],
  reader: any,
  dataStore: any,
  pricesByTokenAddress: any
): Promise<MarketPriceData[]> {
  const results: MarketPriceData[] = [];

  for (const market of markets) {
    const indexTokenSymbol = await getTokenSymbol(market.indexToken);
    const longTokenSymbol = await getTokenSymbol(market.longToken);
    const shortTokenSymbol = await getTokenSymbol(market.shortToken);
    const marketLabel = `${
      indexTokenSymbol === "SPOT" ? "spot" : indexTokenSymbol
    } ${longTokenSymbol}-${shortTokenSymbol}`;

    try {
      const marketPrices = {
        indexTokenPrice: getTokenPrice({ token: market.indexToken, pricesByTokenAddress }),
        longTokenPrice: getTokenPrice({ token: market.longToken, pricesByTokenAddress }),
        shortTokenPrice: getTokenPrice({ token: market.shortToken, pricesByTokenAddress }),
      };

      const [price] = await reader.getMarketTokenPrice(
        dataStore.address,
        market,
        marketPrices.indexTokenPrice,
        marketPrices.longTokenPrice,
        marketPrices.shortTokenPrice,
        MAX_PNL_FACTOR_FOR_TRADERS,
        true
      );

      results.push({
        marketToken: market.marketToken,
        marketLabel,
        price,
      });
    } catch (error) {
      console.error(`Error processing market ${marketLabel}:`, error.message);
      results.push({
        marketToken: market.marketToken,
        marketLabel,
        price: bigNumberify(0),
        error: error.message.substring(0, 100),
      });
    }
  }

  return results;
}

function compareMarketPrices(currentPrices: MarketPriceData[], simulatedPrices: MarketPriceData[]) {
  const results: any[] = [];

  for (let i = 0; i < currentPrices.length; i++) {
    const current = currentPrices[i];
    const simulated = simulatedPrices[i];

    if (current.marketToken !== simulated.marketToken) {
      throw new Error("Market token addresses do not match between current and simulated addresses");
    }

    if (current.error) {
      results.push({
        "market address": current.marketToken,
        market: current.marketLabel,
        error: current.error,
      });
      continue;
    }

    // Calculate price difference
    const priceDiff = simulated.price.sub(current.price);
    const priceDiffPercent = current.price.eq(0) ? bigNumberify(0) : priceDiff.mul(10000).div(current.price); // basis points

    // Price diff percent: basis points (10000 = 100%), need to convert to percentage
    const priceDiffPercentDisplay = priceDiffPercent.abs().toNumber() / 100;

    results.push({
      "market address": current.marketToken,
      market: current.marketLabel,
      "current GM price": formatAmount(current.price, 30, 8),
      "simulated GM price": formatAmount(simulated.price, 30, 8),
      "price diff": formatAmount(priceDiff, 30, 8),
      "price diff %": `${priceDiffPercentDisplay.toFixed(4)}%${priceDiff.lt(0) ? " (-)" : ""}`,
    });
  }

  return results;
}

async function main() {
  const { dataStore, reader, roleStore } = await getContracts(hre.network.name);
  const pricesByTokenAddress = await fetchTickerPrices(hre.network.name);
  const markets = await reader.getMarkets(dataStore.address, 0, 25); // large limit to get all markets
  console.log(`Found ${markets.length} markets`);

  // Step 1: Get current prices (with current settings)
  console.log("\nStep 1: Getting current GM prices...");
  const currentPrices = await getMarketPrices(markets, reader, dataStore, pricesByTokenAddress);

  // Step 2: Set USE_OPEN_INTEREST_IN_TOKENS_FOR_BALANCE to true
  console.log("\nStep 2: Setting USE_OPEN_INTEREST_IN_TOKENS_FOR_BALANCE to true...");
  const controller = await getController(roleStore);
  await dataStore.connect(controller).setBool(USE_OPEN_INTEREST_IN_TOKENS_FOR_BALANCE, true);

  // Step 3: Get simulated prices (with new setting)
  console.log("\nStep 3: Getting simulated GM prices...");
  const simulatedPrices = await getMarketPrices(markets, reader, dataStore, pricesByTokenAddress);

  // Restore original setting
  await dataStore.connect(controller).setBool(USE_OPEN_INTEREST_IN_TOKENS_FOR_BALANCE, false);

  // Step 4: Compare and output results
  console.log("\nStep 4: Comparing prices...");
  const results = compareMarketPrices(currentPrices, simulatedPrices);

  console.table(results);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
