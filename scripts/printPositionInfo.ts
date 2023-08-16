import hre from "hardhat";
import { Reader } from "../typechain-types";
import { BigNumber } from "ethers";
import got from "got";
import { expandDecimals } from "../utils/math";
const ethers = hre.ethers;

function getAvalancheFujiValues() {
  return {
    oracleApi: "https://gmx-oracle-keeper-ro-avalanche-fuji-glyu6psrea-ew.a.run.app/",
  };
}

function getArbibtrumGoerliValues() {
  return {
    oracleApi: "https://gmx-oracle-keeper-arbitrum-goerli-ro-glyu6psrea-ew.a.run.app/",
  };
}

function getArbitrumValues() {
  return {
    oracleApi: "https://arbitrum.gmx-oracle.io/",
    referralStorageAddress: "0xe6fab3F0c7199b0d34d7FbE83394fc0e0D06e99d",
  };
}

function getValues() {
  if (hre.network.name === "avalancheFuji") {
    return getAvalancheFujiValues();
  } else if (hre.network.name === "arbitrumGoerli") {
    return getArbibtrumGoerliValues();
  } else if (hre.network.name === "arbitrum") {
    return getArbitrumValues();
  }
  throw new Error("Unsupported network");
}

async function main() {
  const { oracleApi, referralStorageAddress: _referralStorageAddess } = getValues();

  const dataStoreDeployment = await hre.deployments.get("DataStore");

  let referralStorageAddress = _referralStorageAddess;
  if (!referralStorageAddress) {
    referralStorageAddress = await hre.deployments.get("ReferralStorage");
  }

  const reader = (await hre.ethers.getContract("Reader")) as Reader;
  const positionKey = process.env.POSITION_KEY || ethers.constants.HashZero;

  const position = await reader.getPosition(dataStoreDeployment.address, positionKey);
  const marketAddress = position.addresses.market;
  const market = await reader.getMarket(dataStoreDeployment.address, marketAddress);

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
    dataStoreDeployment.address,
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
