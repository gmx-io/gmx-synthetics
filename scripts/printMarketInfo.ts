const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
import hre from "hardhat";
import { bigNumberify, expandDecimals, formatAmount } from "../utils/math";
import * as keys from "../utils/keys";

const stablecoinPrices = {
  ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831".toLowerCase()]: expandDecimals(1, 24), // USDC (Arbitrum)
  ["0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8".toLowerCase()]: expandDecimals(1, 24), // USDC.e (Arbitrum)
  ["0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9".toLowerCase()]: expandDecimals(1, 24), // USDT (Arbitrum)
  ["0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1".toLowerCase()]: expandDecimals(1, 12), // DAI (Arbitrum)

  ["0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e".toLowerCase()]: expandDecimals(1, 24), // USDC (Avalanche)
  ["0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664".toLowerCase()]: expandDecimals(1, 24), // USDC.e (Avalanche)
  ["0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7".toLowerCase()]: expandDecimals(1, 24), // USDT (Avalanche)
  ["0xc7198437980c041c805A1EDcbA50c1Ce5db95118".toLowerCase()]: expandDecimals(1, 24), // USDT.e (Avalanche)
  ["0xd586E7F844cEa2F87f50152665BCbc2C279D8d70".toLowerCase()]: expandDecimals(1, 12), // DAI.e (Avalanche)
};

function getTickersUrl() {
  const networkName = hre.network.name;

  if (networkName === "arbitrum") {
    return "https://arbitrum-api.gmxinfra.io/prices/tickers";
  } else if (networkName === "avalanche") {
    return "https://avalanche-api.gmxinfra.io/prices/tickers";
  } else if (networkName === "arbitrumGoerli") {
    return "https://gmx-synthetics-api-arb-goerli-4vgxk.ondigitalocean.app/prices/tickers";
  } else {
    throw new Error(`Unsupported network: ${networkName}`);
  }
}

function getTokenPrice({ token, pricesByTokenAddress }) {
  if (token === ethers.constants.AddressZero) {
    return {
      min: bigNumberify(0),
      max: bigNumberify(0),
    };
  }

  let price = pricesByTokenAddress[token.toLowerCase()];

  if (!price) {
    price = {
      min: stablecoinPrices[token.toLowerCase()],
      max: stablecoinPrices[token.toLowerCase()],
    };
  }

  if (!price) {
    throw new Error(`Could not get price for ${token}`);
  }

  return price;
}

async function main() {
  const multicall = await hre.ethers.getContract("Multicall3");

  const tokenPricesResponse = await fetch(getTickersUrl());
  const tokenPrices = await tokenPricesResponse.json();
  const pricesByTokenAddress = {};

  for (const tokenPrice of tokenPrices) {
    pricesByTokenAddress[tokenPrice.tokenAddress.toLowerCase()] = {
      min: bigNumberify(tokenPrice.minPrice),
      max: bigNumberify(tokenPrice.maxPrice),
    };
  }

  const tokens = await hre.gmx.getTokens();
  const addressToSymbol: { [address: string]: string } = {};

  for (const [tokenSymbol, tokenConfig] of Object.entries(tokens)) {
    let address = tokenConfig.address;
    if (!address) {
      address = (await hre.ethers.getContract(tokenSymbol)).address;
    }
    addressToSymbol[address] = tokenSymbol;
  }

  const reader = await hre.ethers.getContract("Reader");
  const dataStore = await hre.ethers.getContract("DataStore");

  const markets = [...(await reader.getMarkets(dataStore.address, 0, 100))];

  const marketPricesList = [];

  for (const market of markets) {
    const marketPrices = {
      indexTokenPrice: getTokenPrice({ token: market.indexToken, pricesByTokenAddress }),
      longTokenPrice: getTokenPrice({ token: market.longToken, pricesByTokenAddress }),
      shortTokenPrice: getTokenPrice({ token: market.shortToken, pricesByTokenAddress }),
    };
    marketPricesList.push(marketPrices);
  }

  const marketInfoList = await reader.getMarketInfoList(dataStore.address, marketPricesList, 0, 100);

  const multicallReadParams = [];
  let propsCount = 0;

  for (const market of markets) {
    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getUint", [
        keys.positionImpactPoolAmountKey(market.marketToken),
      ]),
    });

    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getUint", [
        keys.swapImpactPoolAmountKey(market.marketToken, market.longToken),
      ]),
    });

    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getUint", [
        keys.swapImpactPoolAmountKey(market.marketToken, market.shortToken),
      ]),
    });

    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getUint", [
        keys.positionImpactPoolDistributionRateKey(market.marketToken),
      ]),
    });

    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getUint", [
        keys.minPositionImpactPoolAmountKey(market.marketToken),
      ]),
    });

    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getInt", [
        keys.savedFundingFactorPerSecondKey(market.marketToken),
      ]),
    });

    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getUint", [
        keys.fundingIncreaseFactorPerSecondKey(market.marketToken),
      ]),
    });

    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getUint", [
        keys.fundingDecreaseFactorPerSecondKey(market.marketToken),
      ]),
    });

    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getUint", [keys.fundingUpdatedAtKey(market.marketToken)]),
    });

    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getUint", [
        keys.minFundingFactorPerSecondKey(market.marketToken),
      ]),
    });

    multicallReadParams.push({
      target: dataStore.address,
      allowFailure: false,
      callData: dataStore.interface.encodeFunctionData("getUint", [
        keys.maxFundingFactorPerSecondKey(market.marketToken),
      ]),
    });

    if (propsCount === 0) {
      propsCount = multicallReadParams.length;
    }
  }

  const multicallReadResult = await multicall.callStatic.aggregate3(multicallReadParams);

  const consoleData: any[] = [];

  for (let i = 0; i < marketInfoList.length; i++) {
    const marketInfo = marketInfoList[i];
    const marketPrices = marketPricesList[i];

    const { fundingFactorPerSecond } = marketInfo.nextFunding;

    const indexTokenSymbol = addressToSymbol[marketInfo.market.indexToken];
    const indexToken = tokens[indexTokenSymbol];
    const longTokenSymbol = addressToSymbol[marketInfo.market.longToken];
    const shortTokenSymbol = addressToSymbol[marketInfo.market.shortToken];

    const positionImpactPoolAmount = bigNumberify(multicallReadResult[i * propsCount].returnData);
    const swapImpactPoolAmountForLongToken = bigNumberify(multicallReadResult[i * propsCount + 1].returnData);
    const swapImpactPoolAmountForShortToken = bigNumberify(multicallReadResult[i * propsCount + 2].returnData);
    const positionImpactPoolDistributionRate = bigNumberify(multicallReadResult[i * propsCount + 3].returnData);
    const minPositionImpactPoolAmount = bigNumberify(multicallReadResult[i * propsCount + 4].returnData);
    const savedFundingFactorPerSecond = bigNumberify(
      dataStore.interface.decodeFunctionResult("getInt", multicallReadResult[i * propsCount + 5].returnData).toString()
    );
    const fundingIncreaseFactorPerSecond = bigNumberify(multicallReadResult[i * propsCount + 6].returnData);
    const fundingDecreaseFactorPerSecond = bigNumberify(multicallReadResult[i * propsCount + 7].returnData);
    const fundingUpdatedAt = bigNumberify(multicallReadResult[i * propsCount + 8].returnData);
    const minFundingFactorPerSecond = bigNumberify(multicallReadResult[i * propsCount + 9].returnData);
    const maxFundingFactorPerSecond = bigNumberify(multicallReadResult[i * propsCount + 10].returnData);

    const marketLabel = `${indexTokenSymbol || "spot"} ${longTokenSymbol}-${shortTokenSymbol}`;

    let data: any = {
      market: marketLabel,
      "swp impct pool l": formatAmount(
        swapImpactPoolAmountForLongToken.mul(marketPrices.longTokenPrice.max),
        30,
        0,
        true
      ),
      "swp impct pool s": formatAmount(
        swapImpactPoolAmountForShortToken.mul(marketPrices.shortTokenPrice.max),
        30,
        0,
        true
      ),
    };

    if (indexToken) {
      data = {
        ...data,
        "impct pool": `${formatAmount(positionImpactPoolAmount, indexToken.decimals, 2, true)} ($${formatAmount(
          positionImpactPoolAmount.mul(marketPrices.indexTokenPrice.max),
          30,
          0,
          true
        )})`,
        "impct distr": formatAmount(
          bigNumberify(positionImpactPoolDistributionRate).mul(3600),
          indexToken.decimals + 30,
          6
        ),
        "min impct pool": formatAmount(minPositionImpactPoolAmount, indexToken.decimals, 3, true),
        "fund rate h": formatAmount(fundingFactorPerSecond.mul(3600), 30, 10),
        "fund incr rate h": formatAmount(fundingIncreaseFactorPerSecond.mul(3600), 30, 10),
        "fund decr rate h": formatAmount(fundingDecreaseFactorPerSecond.mul(3600), 30, 10),
        "min fund rate h": formatAmount(minFundingFactorPerSecond.mul(3600), 30, 10),
        "max fund rate h": formatAmount(maxFundingFactorPerSecond.mul(3600), 30, 10),
        "saved fund h": formatAmount(savedFundingFactorPerSecond.mul(3600), 30, 10),
        "fund updated": fundingUpdatedAt.toNumber(),
      };
    }

    consoleData.push(data);
  }

  console.table(consoleData);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
