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
 *     Terminal 1: source .env && anvil --fork-url $ARBITRUM_RPC_URL --host 127.0.0.1 --port 8545
 *     Terminal 2: execute=true npx hardhat run scripts/migrateFeeHandlerBuybacks.ts --network anvil
 *
 *   For Arbitrum:
 *     Terminal 1: execute=true npx hardhat run scripts/migrateFeeHandlerBuybacks.ts --network arbitrum
 *
 *   For Avalanche:
 *     Terminal 1: FORK=avalanche FORK_ID=43114 execute=true npx hardhat run scripts/migrateFeeHandlerBuybacks.ts --network anvil
 */

import hre from "hardhat";
import * as keys from "../utils/keys";
import { formatAmount } from "../utils/math";
import { getBalanceOf } from "../utils/token";
import { hashString } from "../utils/hash";
import got from "got";

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

async function getSigner(roleStore: any) {
  if (hre.network.name === "anvil") {
    // On forked anvil we need to impersonate a controller to call privileged functions
    const controllers = await roleStore.getRoleMembers(hashString("CONTROLLER"), 0, 10);
    const controller = controllers[0];
    console.log(`Impersonating CONTROLLER: ${controller}`);

    const anvilProvider = new ethers.providers.JsonRpcProvider("http://127.0.0.1:8545");
    await anvilProvider.send("anvil_impersonateAccount", [controller]);
    await anvilProvider.send("anvil_setBalance", [controller, "0x1000000000000000000"]);
    return anvilProvider.getUncheckedSigner(controller);
  }

  // On real networks use the configured signer (should already have the required role)
  return hre.ethers.provider.getSigner(0);
}

async function main() {
  const tokens = await hre.gmx.getTokens();
  const addressToSymbol: { [address: string]: string } = {};
  for (const [tokenSymbol, tokenConfig] of Object.entries(tokens)) {
    let address = tokenConfig.address;
    if (!address) {
      address = (await hre.ethers.getContract(tokenSymbol)).address;
    }
    addressToSymbol[address] = tokenSymbol;
  }

  const pricesByToken = await getPricesFromTickers();
  const dataStore = await hre.ethers.getContract("DataStore");
  const feeHandler = await hre.ethers.getContract("FeeHandler");
  const buybackTokens = [
    tokens.GMX,
    hre.network.name === "arbitrum" || hre.network.name === "anvil" ? tokens.WETH : tokens.WAVAX,
  ];

  const data = await Promise.all(
    buybackTokens
      .map((buybackToken) => {
        return Object.values(tokens).map((feeToken) => {
          return dataStore.getUint(keys.buybackAvailableFeeAmountKey(feeToken.address, buybackToken.address));
        });
      })
      .flat()
  );

  const tokensLength = Object.values(tokens).length;
  console.log(buybackTokens);

  for (const [i, buybackToken] of buybackTokens.entries()) {
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
      const amount = data[dataIndex];
      const price = pricesByToken[feeToken.address].maxPriceFull;
      const value = amount.mul(price).div(10 ** priceDecimals);
      const buybackTokenPrice = pricesByToken[buybackToken.address].minPriceFull;
      const buybackTokenDecimals = buybackToken.decimals;
      if (amount.eq(0)) {
        continue;
      }
      console.log("--------------------------------");
      console.log(feeToken.symbol.toString());
      console.log(value.toString());
      console.log(amount.toString());
      console.log(price.toString());
      console.log(feeToken.decimals);
      console.log(
        30 - feeToken.decimals + buybackTokenDecimals,
        feeToken.decimals,
        buybackToken.decimals,
        buybackTokenPrice.toString()
      );
      console.log("--------------------------------");
      const requiredBuybackAmount = value.mul(10 ** priceDecimals).div(buybackTokenPrice);
      tokenList.push({
        symbol: feeToken.symbol,
        amount: amount,
        decimals: feeToken.decimals,
        value: value,
        requiredBuybackAmount: requiredBuybackAmount,
        buybackTokenDecimals: buybackTokenDecimals,
      });
      if (feeToken.symbol === "SOL") {
        console.log(`SOL symbol: ${feeToken.symbol}`);
        console.log(`SOL address: ${feeToken.address}`);
        console.log(`SOL price: ${price.toString()}`);
        console.log(`SOL value: ${value.toString()}`);
        console.log(`SOL amount: ${amount.toString()}`);
        console.log(`SOL decimals: ${feeToken.decimals}`);
        console.log(`SOL buyback token symbol: ${buybackToken.symbol}`);
        console.log(`SOL required buyback amount: ${requiredBuybackAmount.toString()}`);
      }
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
      console.log("Executing buyback...");
      for (const token of sortedTokenList) {
        console.log(`Executing buyback for ${token.symbol}...`);
        console.log(`Amount: ${token.amount.toString()}`);
        console.log(`Value: ${token.value.toString()}`);
        console.log(`Required buyback amount: ${token.requiredBuybackAmount.toString()}`);
        console.log(
          `setup buyback batch size to: ${token.requiredBuybackAmount.mul(10 ** token.buybackTokenDecimals).toString()}`
        );
        const roleStore = await hre.ethers.getContract("RoleStore");
        const signer = await getSigner(roleStore);
        await dataStore
          .connect(signer)
          .setUint(keys.buybackBatchAmountKey(buybackToken.address), token.requiredBuybackAmount);
        const tokenContract = await hre.ethers.getContractAt("IERC20", buybackToken.address);
        await tokenContract.connect(signer).approve(feeHandler.address, token.requiredBuybackAmount);
        await feeHandler.connect(signer).buyback(token.address, buybackToken.address, token.amount, {
          tokens: [token.address],
          providers: [pricesByToken[token.address]],
          data: [],
        });

        /*address feeToken,
        address buybackToken,
        uint256 minOutputAmount,
        OracleUtils.SetPricesParams memory params
        */
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
