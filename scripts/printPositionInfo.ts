import hre from "hardhat";
import { Reader } from "../typechain-types";
import { BigNumber } from "ethers";
import got from "got";
import { expandDecimals } from "../utils/math";
const ethers = hre.ethers;

function getAvalancheFujiValues() {
  return {
    readerAddress: "0xD195592155886b46A2A379430425A1958bE6A0Db",
    dataStoreAddress: "0x79d3d467b5f4Fc63Df52178583643d4b63a5648B",
    referralStorageAddress: "0x41037500DF49EdCD24Df6E19D4e0c4ae8879cE58",
    oracleApi: "https://gmx-oracle-keeper-ro-avalanche-fuji-glyu6psrea-ew.a.run.app/",
  };
}

function getArbibtrumGoerliValues() {
  return {
    readerAddress: "0x6242BB44BBD282B98dE507F2b6c03062CfD3fF6c",
    dataStoreAddress: "0xF2B6e9BAbCdD8812Dd8f93D9BA8aF5112df5A05C",
    referralStorageAddress: "0x91C55cE4221bE83e1934D1654193e41028A75EA1",
    oracleApi: "https://gmx-oracle-keeper-arbitrum-goerli-ro-glyu6psrea-ew.a.run.app/prices/",
  };
}

function getValues() {
  if (hre.network.name === "avalancheFuji") {
    return getAvalancheFujiValues();
  } else if (hre.network.name === "arbitrumGoerli") {
    return getArbibtrumGoerliValues();
  }
  throw new Error("Unsupported network");
}

async function main() {
  const { readerAddress, dataStoreAddress, referralStorageAddress, oracleApi } = getValues();

  const reader = (await hre.ethers.getContractAt("Reader", readerAddress)) as Reader;
  const positionKey = process.env.POSITION_KEY || ethers.constants.HashZero;

  const position = await reader.getPosition(dataStoreAddress, positionKey);
  const marketAddress = position.addresses.market;
  const market = await reader.getMarket(dataStoreAddress, marketAddress);

  const tickers: any[] = await got(`${oracleApi}prices/tickers`).json();

  const prices = ["index", "long", "short"].reduce((acc, key) => {
    const token = market[`${key}Token`];
    const priceData = tickers.find((data) => {
      return data.tokenAddress === token;
    });
    let minPrice;
    let maxPrice;
    if (priceData) {
      minPrice = expandDecimals(priceData.minPrice, priceData.oracleDecimals);
      maxPrice = expandDecimals(priceData.minPrice, priceData.oracleDecimals);
    } else {
      minPrice = maxPrice = expandDecimals(1, 24); // stablecoin
    }
    acc[`${key}TokenPrice`] = {
      min: minPrice,
      max: maxPrice,
    };
    return acc;
  }, {} as any[]);

  const positionInfo = await reader.getPositionInfo(
    dataStoreAddress,
    referralStorageAddress,
    positionKey,
    prices as any,
    0,
    ethers.constants.AddressZero,
    true
  );

  console.log(toLoggableObject(positionInfo));
  console.log("prices", toLoggableObject(prices));
}

function toLoggableObject(obj: any): any {
  if (obj instanceof BigNumber) {
    return obj.toString();
  } else if (typeof obj === "object") {
    const newObj: any = {};
    for (const key of Object.keys(obj)) {
      if (isNaN(Number(key))) {
        newObj[key] = toLoggableObject(obj[key]);
      } else {
        delete newObj[key];
      }
    }
    return newObj;
  } else if (Array.isArray(obj)) {
    return obj.map(toLoggableObject);
  } else {
    return obj;
  }
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
