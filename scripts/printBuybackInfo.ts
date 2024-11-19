import hre from "hardhat";
import * as keys from "../utils/keys";
import { formatAmount } from "../utils/math";
import { getBalanceOf } from "../utils/token";
import got from "got";

function getOracleAbi() {
  if (hre.network.name === "arbitrum") {
    return "https://arbitrum-api.gmxinfra.io/";
  } else if (hre.network.name === "avalanche") {
    return "https://avalanche-api.gmxinfra.io/";
  }
  throw new Error("Unsupported network");
}

async function getPricesFromTickers() {
  const tickers: any[] = await got(`${getOracleAbi()}prices/tickers`).json();
  return Object.fromEntries(
    tickers.map((ticker) => {
      return [ticker.tokenAddress, ticker.maxPrice];
    })
  );
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
  const buybackTokens = [tokens.GMX, hre.network.name === "arbitrum" ? tokens.WETH : tokens.WAVAX];

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
    for (const [j, feeToken] of Object.values(tokens).entries()) {
      const dataIndex = i * tokensLength + j;
      const amount = data[dataIndex];
      if (amount.eq(0)) {
        continue;
      }
      const price = pricesByToken[feeToken.address];
      console.log(
        `    Fee token: ${feeToken.symbol.padEnd(6)} amount: ${formatAmount(
          amount,
          feeToken.decimals,
          4
        )} ($${formatAmount(amount.mul(price), 30, 2)})`
      );
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
