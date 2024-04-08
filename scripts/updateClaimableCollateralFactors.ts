import hre from "hardhat";

import { gql } from "@apollo/client";

import { getSubgraphClient } from "../utils/stats";
import { fetchTickerPrices } from "../utils/prices";
import { bigNumberify, formatAmount, expandDecimals } from "../utils/math";
import { handleInBatches } from "../utils/batch";

async function updateSingleFactor() {
  const config = await hre.ethers.getContract("Config");

  for (const key of ["MARKET", "TOKEN", "TIME_KEY", "FACTOR"]) {
    if (!process.env[key]) {
      throw new Error(`${key} env var is required`);
    }
  }

  const market = process.env.MARKET;
  const token = process.env.TOKEN;
  const timeKey = process.env.TIME_KEY;
  const account = process.env.ACCOUNT;
  const factor = process.env.FACTOR;

  if (account) {
    const tx = await config.setClaimableCollateralFactorForAccount(market, token, timeKey, account, factor);
    console.info(`tx sent: ${tx.hash}`);
  } else {
    const tx = await config.setClaimableCollateralFactorForTime(market, token, timeKey, factor);
    console.info(`tx sent: ${tx.hash}`);
  }
}

async function updateMultipleFactors() {
  const client = getSubgraphClient(hre.network.name);

  const day = 24 * 60 * 60;
  let startTime = parseInt(process.env.START);
  let endTime = parseInt(process.env.END);

  if (isNaN(endTime)) {
    endTime = parseInt(parseInt(Date.now() / 1000) / day) * day - 2 * day;
  }

  if (isNaN(startTime)) {
    startTime = endTime - 7 * day;
  }

  console.log("time", startTime, endTime);

  const pageIndex = 0;
  const pageSize = 1000;

  const query = gql(`{
      claimableCollateralGroups(
        skip: ${pageIndex * pageSize}
        first: ${pageSize}
        orderBy: timeKey
        orderDirection: desc
        where: { factor: 0 }
      ) {
          id
          timeKey
          marketAddress
          tokenAddress
          factor
          claimables {
            id
            account
            value
            factor
         }
    }
  }`);

  const { data } = await client.query({ query, fetchPolicy: "no-cache" });
  const { claimableCollateralGroups } = data;

  const tickerPrices = await fetchTickerPrices();
  let totalValueInUsd = bigNumberify(0);

  for (const claimableGroup of claimableCollateralGroups) {
    const tokenPrice = tickerPrices[claimableGroup.tokenAddress];
    for (const claimable of claimableGroup.claimables) {
      const valueInUsd = bigNumberify(claimable.value).mul(tokenPrice.max);
      totalValueInUsd = totalValueInUsd.add(valueInUsd);
    }
  }

  console.info("total value in USD", formatAmount(totalValueInUsd, 30, 2, true));

  let threshold = expandDecimals(10_000, 30);
  if (process.env.THRESHOLD) {
    threshold = expandDecimals(process.env.THRESHOLD, 30);
  }

  if (totalValueInUsd.gt(threshold)) {
    throw new Error("totalValueInUsd exceeds threshold");
  }

  const config = await hre.ethers.getContract("Config");

  await handleInBatches(claimableCollateralGroups, 20, async (batch) => {
    const multicallWriteParams = [];

    for (const claimableGroup of batch) {
      const time = parseInt(claimableGroup.timeKey) * 60 * 60;

      if (time < startTime || time > endTime) {
        continue;
      }

      multicallWriteParams.push(
        config.interface.encodeFunctionData("setClaimableCollateralFactorForTime", [
          claimableGroup.marketAddress,
          claimableGroup.tokenAddress,
          claimableGroup.timeKey,
          expandDecimals(1, 30), // factor
        ])
      );
    }

    if (multicallWriteParams.length === 0) {
      return;
    }

    if (process.env.WRITE === "true") {
      const tx = await config.multicall(multicallWriteParams);
      await tx.wait(2);
      console.info(`tx sent: ${tx.hash}`);
    } else {
      console.info("NOTE: executed in read-only mode, no transactions were sent");
    }
  });
}

async function main() {
  if (process.env.SINGLE === "true") {
    await updateSingleFactor();
    return;
  }

  await updateMultipleFactors();
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
