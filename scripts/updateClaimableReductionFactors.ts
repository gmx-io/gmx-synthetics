import hre from "hardhat";

import { expandDecimals, bigNumberify } from "../utils/math";
import { getFullKey } from "../utils/config";
import { encodeData } from "../utils/hash";
import { CLAIMABLE_REDUCTION_FACTOR_LIST } from "../data/claimableReductionFactors.js";
import * as keys from "../utils/keys";

async function updateMultipleFactors(reductionList) {
  const config = await hre.ethers.getContract("Config");
  const dataStore = await hre.ethers.getContract("DataStore");

  const day = 24 * 60 * 60;
  let startTime = parseInt(process.env.START);
  let endTime = parseInt(process.env.END);

  if (isNaN(endTime)) {
    endTime = parseInt(parseInt(Date.now() / 1000) / day) * day;
  }

  if (isNaN(startTime)) {
    startTime = endTime - 5 * day;
  }

  if (reductionList.length === 0) {
    throw new Error("Empty reductionList");
  }

  const multicallReadParams = [];
  for (const reductionItem of reductionList) {
    for (const account of reductionItem.accounts) {
      multicallReadParams.push({
        target: dataStore.address,
        allowFailure: false,
        callData: dataStore.interface.encodeFunctionData("getUint", [
          getFullKey(
            keys.CLAIMABLE_COLLATERAL_AMOUNT,
            encodeData(
              ["address", "address", "uint256", "address"],
              [reductionItem.market, reductionItem.token, reductionItem.timeKey, account]
            )
          ),
        ]),
      });
      multicallReadParams.push({
        target: dataStore.address,
        allowFailure: false,
        callData: dataStore.interface.encodeFunctionData("getUint", [
          getFullKey(
            keys.CLAIMABLE_COLLATERAL_REDUCTION_FACTOR,
            encodeData(
              ["address", "address", "uint256", "address"],
              [reductionItem.market, reductionItem.token, reductionItem.timeKey, account]
            )
          ),
        ]),
      });
    }
  }
  const multicall = await hre.ethers.getContract("Multicall3");
  const result = await multicall.callStatic.aggregate3(multicallReadParams);

  const paramsCount = 2;
  let i = 0;
  let sum = bigNumberify(0);
  for (const reductionItem of reductionList) {
    for (const account of reductionItem.accounts) {
      const amount = bigNumberify(result[i * paramsCount].returnData);
      console.log(
        `${account}, ${reductionItem.timeKey}, ${reductionItem.market}, ${
          reductionItem.token
        }, amount: ${amount.toString()}, reduction factor: ${bigNumberify(
          result[i * paramsCount + 1].returnData
        ).toString()}`
      );
      sum = sum.add(amount);
      i++;
    }
  }
  console.log("sum:", sum.toString());

  const multicallWriteParams = [];
  for (const reductionItem of reductionList) {
    const time = parseInt(reductionItem.timeKey) * 60 * 60;

    if (time < startTime || time > endTime) {
      throw new Error("time is not within range");
      continue;
    }

    for (const account of reductionItem.accounts) {
      multicallWriteParams.push(
        config.interface.encodeFunctionData("setClaimableCollateralReductionFactorForAccount", [
          reductionItem.market,
          reductionItem.token,
          reductionItem.timeKey,
          account,
          expandDecimals(1, 30), // factor
        ])
      );
    }
  }

  if (process.env.WRITE === "true") {
    const tx = await config.multicall(multicallWriteParams);
    await tx.wait(2);
    console.info(`tx sent: ${tx.hash}`);
  } else {
    console.info("NOTE: executed in read-only mode, no transactions were sent");
  }
}

async function main() {
  await updateMultipleFactors(CLAIMABLE_REDUCTION_FACTOR_LIST[hre.network.name]);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
