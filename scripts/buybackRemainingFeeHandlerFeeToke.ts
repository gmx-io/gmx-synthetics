/**
 * Script to migrate buybacks from FeeHandler to FeeVault
 *
 * This script migrates buybacks from FeeHandler to FeeVault.
 *
 * IMPORTANT: This script REQUIRES Anvil to be running because it:
 * - Impersonates a CONTROLLER account
 * - Modifies contract state
 * - Restores the original setting
 *
 * Usage:
 *   For testing:
 *     Terminal 1: anvil --fork-url $ARBITRUM_RPC_URL --host 127.0.0.1 --port 8545
 *     Terminal 2: EXECUTE=true npx hardhat run scripts/migrateFeeHandlerBuybacks.ts --network anvil
 *
 *   For Arbitrum:
 *     check for stats: npx hardhat run scripts/migrateFeeHandlerBuybacks.ts --network arbitrum
 *     Execute: execute=true npx hardhat run scripts/migrateFeeHandlerBuybacks.ts --network arbitrum
 *
 *   For Avalanche:
 *     check for stats: npx hardhat run scripts/migrateFeeHandlerBuybacks.ts --network avalanche
 *     Execute: FORK=avalanche execute=true npx hardhat run scripts/migrateFeeHandlerBuybacks.ts --network avalanche
 */

import hre from "hardhat";
import * as keys from "../utils/keys";
import { formatAmount } from "../utils/math";
import { getBalanceOf } from "../utils/token";
import { hashString } from "../utils/hash";
import { hashData } from "../utils/hash";
import { expandDecimals } from "../utils/math";
const { ethers } = hre;
import got from "got";

export const ORACLE_PROVIDER_FOR_TOKEN = hashString("ORACLE_PROVIDER_FOR_TOKEN"); // used for old oracle

// When running against an anvil fork, tell hardhat-deploy which network's deployments to load.
if (hre.network.name === "anvil" && !process.env.HARDHAT_DEPLOY_FORK) {
  process.env.HARDHAT_DEPLOY_FORK = process.env.FORK || "arbitrum";
}

function getOracleAbi() {
  if (hre.network.name === "arbitrum" || hre.network.name === "anvil") {
    return "https://arbitrum-api.gmxinfra.io/";
  } else if (hre.network.name === "avalanche") {
    return "https://avalanche-api.gmxinfra.io/";
  }
  throw new Error("Unsupported network");
}

async function getPricesFromTickers() {
  const tickers: any[] = await got(`${getOracleAbi()}signed_prices/latest`).json();
  return Object.fromEntries(
    tickers["signedPrices"].map((ticker) => {
      return [
        ticker.tokenAddress,
        { maxPriceFull: ticker.maxPriceFull, minPriceFull: ticker.minPriceFull, blob: ticker.blob },
      ];
    })
  );
}

export function oracleProviderForTokenKey_v2_1(token: string) {
  return hashData(["bytes32", "address"], [ORACLE_PROVIDER_FOR_TOKEN, token]);
}

async function getOracleProvider(tokenAddress: string) {
  const dataStore = await ethers.getContract("DataStore");
  return dataStore.getAddress(oracleProviderForTokenKey_v2_1(tokenAddress));
}

async function getSigner(roleStore: any) {
  if (hre.network.name === "anvil") {
    // On forked anvil, we need to mint GMX to the controller to call privileged functions
    const controllers = await roleStore.getRoleMembers(hashString("CONTROLLER"), 0, 10);
    const controller = controllers[0];

    const gmxMinterAddress = "0x9c453e9e64d419c9be034d1a645bf850086a1729";
    console.log(`Impersonating GMX Minter and Minting GMX to CONTROLLER: ${gmxMinterAddress}`);
    const anvilProvider = new ethers.providers.JsonRpcProvider("http://127.0.0.1:8545");
    await anvilProvider.send("anvil_impersonateAccount", [gmxMinterAddress]);
    await anvilProvider.send("anvil_setBalance", [gmxMinterAddress, "0x1000000000000000000"]);
    const gmxMinterSigner = anvilProvider.getUncheckedSigner(gmxMinterAddress);

    // gmx arbitrum address for testing
    const gmxAddress = "0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a";
    const gmx = await ethers.getContractAt("IGMXMinterBurnable", gmxAddress);
    await gmx.connect(gmxMinterSigner).mint(controller, expandDecimals(100_000, 18));

    // On forked anvil we need to impersonate a controller to call privileged functions
    console.log(`Impersonating CONTROLLER: ${controller}`);
    await anvilProvider.send("anvil_impersonateAccount", [controller]);
    await anvilProvider.send("anvil_setBalance", [controller, "0x10000000000000000000000"]);

    // weth arbitrum address for testing
    const wethAddress = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";
    const wnt = await ethers.getContractAt("WNT", wethAddress);
    const controllerSigner = anvilProvider.getUncheckedSigner(controller);
    await wnt.connect(controllerSigner).deposit({ value: expandDecimals(1_000, 18) });

    return controllerSigner;
  }

  // On real networks use the configured signer (should already have the required role)
  return ethers.provider.getSigner(0);
}

async function main() {
  const tokens = await hre.gmx.getTokens();
  const addressToSymbol: { [address: string]: string } = {};
  for (const [tokenSymbol, tokenConfig] of Object.entries(tokens)) {
    let address = tokenConfig.address;
    if (!address) {
      address = (await ethers.getContract(tokenSymbol)).address;
    }
    addressToSymbol[address] = tokenSymbol;
  }

  const pricesByToken = await getPricesFromTickers();
  const dataStore = await ethers.getContract("DataStore");
  const feeHandler = await ethers.getContract("FeeHandler");
  const buybackTokens = [
    tokens.GMX,
    hre.network.name === "arbitrum" || hre.network.name === "anvil" ? tokens.WETH : tokens.WAVAX,
  ];

  const multicall = await ethers.getContract("Multicall3");
  const multicallData = await multicall.callStatic.aggregate3(
    buybackTokens.flatMap((buybackToken) => {
      return Object.values(tokens).map((feeToken) => {
        return {
          target: dataStore.address,
          callData: dataStore.interface.encodeFunctionData("getUint", [
            keys.buybackAvailableFeeAmountKey(feeToken.address, buybackToken.address),
          ]),
        };
      });
    })
  );
  const data = multicallData.map((item) => item.returnData);
  const tokensLength = Object.values(tokens).length;

  for (const [i, buybackToken] of buybackTokens.entries()) {
    const buybackTokenOracleProvider = await getOracleProvider(buybackToken.address);
    console.log(`Buyback token: ${buybackToken.symbol}`);
    const withdrawableAmount = await dataStore.getUint(keys.withdrawableBuybackTokenAmountKey(buybackToken.address));
    const contractBalance = await getBalanceOf(buybackToken.address, feeHandler.address);
    console.log(
      `Withdrawable amount: ${withdrawableAmount.toString()}, Contract balance: ${contractBalance.toString()}`
    );
    if (contractBalance.lt(withdrawableAmount)) {
      throw new Error(`Insufficient contract balance`);
    }
    const tokenList = [];
    for (const [j, feeToken] of Object.values(tokens).entries()) {
      const priceDecimals = 12;
      const dataIndex = i * tokensLength + j;
      const amount = ethers.BigNumber.from(data[dataIndex]);
      const price = pricesByToken[feeToken.address].maxPriceFull;
      const value = amount.mul(price).div(10 ** priceDecimals);
      const buybackTokenPrice = pricesByToken[buybackToken.address].minPriceFull;
      const buybackTokenDecimals = buybackToken.decimals;
      if (amount.eq(0)) {
        continue;
      }
      const requiredBuybackAmount = value.mul(10 ** priceDecimals).div(buybackTokenPrice);
      tokenList.push({
        symbol: feeToken.symbol,
        address: feeToken.address,
        amount: amount,
        decimals: feeToken.decimals,
        value: value,
        requiredBuybackAmount: requiredBuybackAmount,
        buybackTokenDecimals: buybackTokenDecimals,
        buybackTokenAddress: buybackToken.address,
        buybackTokenSymbol: buybackToken.symbol,
        tokenOracleProvider: await getOracleProvider(feeToken.address),
        buybackTokenOracleProvider: buybackTokenOracleProvider,
      });
    }
    const sortedTokenList = tokenList.sort((a, b) => b.value.sub(a.value));
    for (const token of sortedTokenList) {
      console.log(
        `    Fee token: ${token.symbol.padEnd(6)} amount: ${formatAmount(
          token.amount,
          token.decimals,
          4
        )} ($${formatAmount(token.value, token.priceDecimals, 2)}) required buyback amount: ${formatAmount(
          token.requiredBuybackAmount,
          token.buybackTokenDecimals,
          2
        )}`
      );
    }
    if (process.env.EXECUTE === "true") {
      const roleStore = await ethers.getContract("RoleStore");
      const signer = await getSigner(roleStore);
      console.log("Executing buyback...");
      for (const token of sortedTokenList) {
        // update prices to avoid expiration date exceeded error
        const pricesByToken = await getPricesFromTickers();
        const tokenBlob = pricesByToken[token.address].blob;
        const buybackTokenBlob = pricesByToken[buybackToken.address].blob;
        console.log(`Executing buyback for ${token.symbol} using ${buybackToken.symbol}...`);
        console.log(`Amount: ${token.amount.toString()}`);
        console.log(`Value: ${token.value.toString()}`);
        console.log(
          `balances of buyback token(${buybackToken.symbol}): `,
          (await getBalanceOf(buybackToken.address, feeHandler.address)).toString()
        );
        console.log(`Required buyback amount: ${token.requiredBuybackAmount.toString()}`);
        console.log(`setup buyback batch size to: ${token.requiredBuybackAmount.toString()}`);
        await dataStore
          .connect(signer)
          .setUint(keys.buybackBatchAmountKey(buybackToken.address), token.requiredBuybackAmount);
        const tokenContract = await ethers.getContractAt("IERC20", buybackToken.address);
        await tokenContract.connect(signer).approve(feeHandler.address, token.requiredBuybackAmount);
        console.log(
          "buyback token size reduced to: ",
          (await dataStore.getUint(keys.buybackBatchAmountKey(buybackToken.address))).toString()
        );
        await feeHandler.connect(signer).buyback(token.address, buybackToken.address, token.amount, {
          tokens: [token.address, buybackToken.address],
          providers: [token.tokenOracleProvider, token.buybackTokenOracleProvider],
          data: [tokenBlob, buybackTokenBlob],
        });
      }
      for (const token of sortedTokenList) {
        const availableFeeAmount = await dataStore.getUint(
          keys.buybackAvailableFeeAmountKey(token.address, token.buybackTokenAddress)
        );
        console.log(
          `Remaining fee token(${token.symbol}) amount in feeHandler using buyback token(${
            token.buybackTokenSymbol
          }) is: ${availableFeeAmount.toString()}`
        );
      }
    }
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
