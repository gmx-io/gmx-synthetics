import hre from "hardhat";
import * as keys from "../utils/keys";
import { formatAmount } from "../utils/math";

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

  const dataStore = await hre.ethers.getContract("DataStore");
  const buybackTokens = [tokens.GMX, tokens.WETH];

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
    for (const [j, feeToken] of Object.values(tokens).entries()) {
      const dataIndex = i * tokensLength + j;
      const amount = data[dataIndex];
      if (amount.eq(0)) {
        continue;
      }
      console.log(`    Fee token: ${feeToken.symbol} amount: ${formatAmount(amount, feeToken.decimals, 4)}`);
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
