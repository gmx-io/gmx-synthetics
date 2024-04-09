import hre from "hardhat";
import { bigNumberify } from "../utils/math";
import * as keys from "../utils/keys";

function appendQuery({ multicallReadParams, queries, dataStore, market, token, timeKey, account }) {
  const key = keys.claimableCollateralAmountKey(market.marketToken, token, timeKey, account);

  multicallReadParams.push({
    target: dataStore.address,
    allowFailure: false,
    callData: dataStore.interface.encodeFunctionData("getUint", [key]),
  });

  queries.push({
    market,
    token,
    timeKey,
  });
}

async function main() {
  const dataStore = await hre.ethers.getContract("DataStore");
  const reader = await hre.ethers.getContract("Reader");
  const multicall = await hre.ethers.getContract("Multicall3");
  const markets = await reader.getMarkets(dataStore.address, 0, 1000);

  const startTime = parseInt(process.env.START_TIME);
  const endTime = parseInt(process.env.END_TIME);
  const account = process.env.ACCOUNT;

  const divisor = (await dataStore.getUint(keys.CLAIMABLE_COLLATERAL_TIME_DIVISOR)).toNumber();

  const queries = [];

  const multicallReadParams = [];

  for (let i = startTime; i < endTime; i += divisor) {
    const timeKey = parseInt(i / divisor);

    for (let j = 0; j < markets.length; j++) {
      const market = markets[j];

      appendQuery({
        multicallReadParams,
        queries,
        dataStore,
        market,
        token: market.longToken,
        timeKey,
        account,
      });

      appendQuery({
        multicallReadParams,
        queries,
        dataStore,
        market,
        token: market.shortToken,
        timeKey,
        account,
      });
    }
  }

  const result = await multicall.callStatic.aggregate3(multicallReadParams);

  const claimableAmountItems = [];
  for (let i = 0; i < queries.length; i++) {
    const value = bigNumberify(result[i].returnData);
    if (value.gt(0)) {
      claimableAmountItems.push({
        query: queries[i],
        value,
      });
    }
  }

  if (claimableAmountItems.length === 0) {
    console.info("no claimable amounts for the given time range");
  } else {
    console.info("claimable amount, market, token, time key");
    for (let i = 0; i < claimableAmountItems.length; i++) {
      const item = claimableAmountItems[i];
      const { value, query } = item;
      console.info(`${value.toString()}, ${query.market.marketToken}, ${query.token}, ${query.timeKey}`);
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
