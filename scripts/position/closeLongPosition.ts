import hre from "hardhat";
import got from "got";
import { toLoggableObject } from "../../utils/print";
import { Position } from "../../typechain-types/contracts/position/PositionUtils";
import { hashData } from "../../utils/hash";
import { TokenConfig, TokensConfig } from "../../config/tokens";
import { expandDecimals, formatAmount } from "../../utils/math";
import { DecreasePositionSwapType, OrderType } from "../../utils/order";
import { ExchangeRouter, IBaseOrderUtils } from "../../typechain-types/contracts/router/ExchangeRouter";

const ethers = hre.ethers;

function getAvalancheFujiValues() {
  return {
    oracleApi: "https://synthetics-api-avax-fuji-upovm.ondigitalocean.app/",
  };
}

function getArbibtrumGoerliValues() {
  return {
    oracleApi: "https://gmx-synthetics-api-arb-goerli-4vgxk.ondigitalocean.app/",
  };
}

function getArbitrumValues() {
  return {
    oracleApi: "https://arbitrum-api.gmxinfra.io/",
    referralStorageAddress: "0xe6fab3F0c7199b0d34d7FbE83394fc0e0D06e99d",
  };
}

function getValues(): {
  oracleApi: string;
  referralStorageAddress?: string;
} {
  if (hre.network.name === "avalancheFuji") {
    return getAvalancheFujiValues();
  } else if (hre.network.name === "arbitrumGoerli") {
    return getArbibtrumGoerliValues();
  } else if (hre.network.name === "arbitrum") {
    return getArbitrumValues();
  }
  throw new Error("Unsupported network");
}

const coingeckoMapping = {
  BNB: "bnb",
  ATOM: "cosmos-hub",
  NEAR: "near",
  AAVE: "aave",
  BTC: "bitcoin",
  "WBTC.e": "bitcoin",
  WETH: "ethereum",
  XRP: "ripple",
  LTC: "litecoin",
  DOGE: "dogecoin",
  ARB: "arbtrium",
  LINK: "chainlink",
  SOL: "solana",
  UNI: "uniswap",
  USDC: "usd-coin",
  "USDC.e": "usd-coin",
  USDT: "tether",
  DAI: "dai",
};

async function getPricesFromCoingecko(tokens: [string, TokenConfig][], timestamp: number) {
  const dateArg = new Date(timestamp * 1000).toISOString().substring(0, 10).split("-").reverse().join("-");

  return Promise.all(
    tokens.map(async ([symbol, token]) => {
      const url = `https://api.coingecko.com/api/v3/coins/${coingeckoMapping[symbol]}/history?date=${dateArg}`;
      console.log("URL", url);
      const data = await got(url).json();
      const price = (data as any).market_data.current_price.usd;
      const priceDecimals = 30 - token.decimals;
      const adjustedPrice = expandDecimals(Math.round(price * 1e6), priceDecimals - 6);
      return adjustedPrice;
    })
  );
}

async function getPricesFromTickers(oracleApi: string, market: any) {
  const tickers: any[] = await got(`${oracleApi}prices/tickers`).json();
  return ["index", "long", "short"].reduce((acc, key) => {
    const token = market[`${key}Token`];
    const priceData = tickers.find((data) => {
      return data.tokenAddress === token;
    });
    let minPrice;
    let maxPrice;
    if (priceData) {
      minPrice = priceData.minPrice;
      maxPrice = priceData.minPrice;
    } else {
      throw new Error(`no price data for ${key} token ${token}`);
    }
    acc[`${key}TokenPrice`] = {
      min: minPrice,
      max: maxPrice,
    };
    return acc;
  }, {} as any[]);
}

async function getPrices(oracleApi: string, market: any, tokens: TokensConfig, timestamp: number | undefined) {
  if (timestamp) {
    const indexSymbolAndToken = Object.entries(tokens).find((data) => data[1].address === market.indexToken);
    const longSymbolAndToken = Object.entries(tokens).find((data) => data[1].address === market.longToken);
    const shortSymbolAndToken = Object.entries(tokens).find((data) => data[1].address === market.shortToken);

    const [indexPrice, longPrice, shortPrice] = await getPricesFromCoingecko(
      [indexSymbolAndToken, longSymbolAndToken, shortSymbolAndToken],
      timestamp
    );

    return {
      indexTokenPrice: { min: indexPrice, max: indexPrice },
      longTokenPrice: { min: longPrice, max: longPrice },
      shortTokenPrice: { min: shortPrice, max: shortPrice },
    };
  }

  return getPricesFromTickers(oracleApi, market);
}

async function main() {
  const { oracleApi, referralStorageAddress: _referralStorageAddess } = getValues();
  const tokens = (await (hre as any).gmx.getTokens()) as TokensConfig;

  const dataStoreDeployment = await hre.deployments.get("DataStore");
  const reader = await hre.ethers.getContract("Reader");
  const exchangeRouter: ExchangeRouter = await ethers.getContract("ExchangeRouter");
  const orderVault = await ethers.getContract("OrderVault");

  let referralStorageAddress = _referralStorageAddess;
  if (!referralStorageAddress) {
    referralStorageAddress = (await hre.deployments.get("ReferralStorage")).address;
  }

  if (!referralStorageAddress) {
    throw new Error("no referralStorageAddress");
  }

  const blockTag = "latest";
  const timestamp: number | undefined = undefined;

  const _positionKey = process.env.POSITION_KEY;

  let position: Position.PropsStructOutput;

  if (_positionKey) {
    position = await reader.getPosition(dataStoreDeployment.address, _positionKey, { blockTag });
  } else {
    throw new Error("POSITION_KEY is required");
  }

  const positionKey = hashData(
    ["address", "address", "address", "bool"],
    [position.addresses.account, position.addresses.market, position.addresses.collateralToken, position.flags.isLong]
  );

  console.log("position", toLoggableObject(position));

  const marketAddress = position.addresses.market;
  const market = await reader.getMarket(dataStoreDeployment.address, marketAddress, { blockTag });

  const prices = await getPrices(oracleApi, market, tokens, timestamp);
  const isCollateralTokenLong = position.addresses.collateralToken === market.longToken;
  const collateralTokenPrice = prices[isCollateralTokenLong ? "longTokenPrice" : "shortTokenPrice"].min;
  const [collateralSymbol, collateralToken] = Object.entries(tokens).find(
    (data) => data[1].address === position.addresses.collateralToken
  );

  console.log("prices", toLoggableObject(prices));

  console.log("reader %s", reader.address);
  console.log("dataStore %s", dataStoreDeployment.address);
  console.log("referralStorageAddress %s", referralStorageAddress);

  const positionInfo = await reader.getPositionInfo(
    dataStoreDeployment.address,
    referralStorageAddress,
    positionKey,
    prices as any,
    0,
    ethers.constants.AddressZero,
    true,
    { blockTag }
  );

  console.log(toLoggableObject(positionInfo));

  console.log(
    "pending pnl %s pending fees %s (%s %s) price impact %s",
    formatAmount(positionInfo.basePnlUsd, 30, 2),
    formatAmount(positionInfo.fees.totalCostAmount.mul(collateralTokenPrice), 30, 2),
    formatAmount(positionInfo.fees.totalCostAmount, collateralToken.decimals),
    collateralSymbol,
    formatAmount(positionInfo.executionPriceResult.priceImpactUsd, 30, 2)
  );

  const executionFee = expandDecimals(3, 14);
  const decreaseParams: IBaseOrderUtils.CreateOrderParamsStruct = {
    addresses: {
      receiver: position.addresses.account,
      cancellationReceiver: ethers.constants.AddressZero,
      uiFeeReceiver: ethers.constants.AddressZero,
      callbackContract: ethers.constants.AddressZero,
      market: position.addresses.market,
      initialCollateralToken: position.addresses.collateralToken,
      swapPath: [],
    },
    numbers: {
      sizeDeltaUsd: positionInfo.position.numbers.sizeInUsd,
      triggerPrice: 0,
      acceptablePrice: prices.indexTokenPrice.max,
      executionFee,
      callbackGasLimit: 0,
      minOutputAmount: 0,
      initialCollateralDeltaAmount: positionInfo.position.numbers.collateralAmount,
      validFromTime: 0,
    },
    orderType: OrderType.MarketDecrease,
    isLong: true,
    shouldUnwrapNativeToken: false,
    decreasePositionSwapType: DecreasePositionSwapType.SwapPnlTokenToCollateralToken,
    autoCancel: true,
    referralCode: positionInfo.fees.referral.referralCode,
    dataList: [],
  };

  console.log("decreaseParams", decreaseParams);

  const multicallArgs = [
    exchangeRouter.interface.encodeFunctionData("sendWnt", [orderVault.address, executionFee]),
    exchangeRouter.interface.encodeFunctionData("createOrder", [decreaseParams]),
  ];
  console.log("multicall args", multicallArgs);

  const tx = await exchangeRouter.multicall(multicallArgs, {
    value: executionFee,
    gasLimit: 1_500_000,
  });

  console.log("transaction sent", tx.hash);
  await tx.wait();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => {
    console.log("Done");
    process.exit(0);
  });
