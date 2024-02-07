import hre from "hardhat";
import { Reader } from "../typechain-types";
import got from "got";
import { toLoggableObject } from "../utils/print";
import { Position } from "../typechain-types/contracts/position/PositionUtils";
import { hashData } from "../utils/hash";
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

  if (!referralStorageAddress) {
    throw new Error("no referralStorageAddress");
  }

  const reader = (await hre.ethers.getContract("Reader")) as Reader;
  let positionKey = process.env.POSITION_KEY;

  let position: Position.PropsStructOutput;

  if (positionKey) {
    position = await reader.getPosition(dataStoreDeployment.address, positionKey);
  } else {
    const traderAddress = process.env.TRADER || "0x6744a9c6e3a9b8f7243ace5b20d51a500fcd0353";
    console.warn("using default trader address %s", traderAddress);
    const traderPositions = await reader.getAccountPositions(dataStoreDeployment.address, traderAddress, 0, 1);

    if (traderPositions.length === 0) {
      throw new Error("POSITION_KEY is required");
    }

    position = traderPositions[0];
    positionKey = hashData(
      ["address", "address", "address", "bool"],
      [position.addresses.account, position.addresses.market, position.addresses.collateralToken, position.flags.isLong]
    );
  }

  if (position.addresses.market === ethers.constants.AddressZero) {
    console.log("position %s does not exist", positionKey);
    return;
  }

  console.log("position", toLoggableObject(position));

  const marketAddress = position.addresses.market;
  const market = await reader.getMarket(dataStoreDeployment.address, marketAddress);

  console.log("market %s %s %s", market.indexToken, market.longToken, market.shortToken);

  const tickers: any[] = await got(`${oracleApi}prices/tickers`).json();

  const prices = ["index", "long", "short"].reduce((acc, key) => {
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
    true
  );

  console.log(toLoggableObject(positionInfo));
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
