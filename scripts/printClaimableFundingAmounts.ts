import hre from "hardhat";
import { bigNumberify } from "../utils/math";
import * as keys from "../utils/keys";

function appendQuery({ multicallReadParams, queries, dataStore, market, token, account }) {
  const key = keys.claimableFundingAmountKey(market.marketToken, token, account);

  multicallReadParams.push({
    target: dataStore.address,
    allowFailure: false,
    callData: dataStore.interface.encodeFunctionData("getUint", [key]),
  });

  queries.push({
    market,
    token,
  });
}

async function main() {
  const dataStore = await hre.ethers.getContract("DataStore");
  const reader = await hre.ethers.getContract("Reader");
  const multicall = await hre.ethers.getContract("Multicall3");
  const markets = await reader.getMarkets(dataStore.address, 0, 1000);

  const account = process.env.ACCOUNT;
  if (!account) {
    throw new Error("ACCOUNT env var is required");
  }
  const blockTag = Number(process.env.BLOCK) || "latest";
  const queries = [];

  const multicallReadParams = [];

  for (const market of markets) {
    appendQuery({
      multicallReadParams,
      queries,
      dataStore,
      market,
      token: market.longToken,
      account,
    });

    appendQuery({
      multicallReadParams,
      queries,
      dataStore,
      market,
      token: market.shortToken,
      account,
    });
  }

  const result = await multicall.callStatic.aggregate3(multicallReadParams, {
    blockTag,
  });

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
    console.info("no claimable amounts");
  } else {
    console.info("claimable amount, market, token");
    for (let i = 0; i < claimableAmountItems.length; i++) {
      const item = claimableAmountItems[i];
      const { value, query } = item;
      console.info(`${value.toString()}, ${query.market.marketToken}, ${query.token}`);
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
