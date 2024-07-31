import hre from "hardhat";
import { DataStore, Multicall3 } from "../typechain-types";
import { hashData, hashString } from "../utils/hash";
import { fetchJson } from "ethers/lib/utils";

function getListKey(positionKey: string) {
  return hashData(["bytes32", "bytes32"], [hashString("AUTO_CANCEL_ORDER_LIST"), positionKey]);
}

async function main() {
  const dataStore = (await hre.ethers.getContract("DataStore")) as DataStore;
  const multicall = (await hre.ethers.getContract("Multicall3")) as Multicall3;

  const positionKeys = await fetchJson(
    "https://api.dune.com/api/v1/query/3955674/results?limit=30000&api_key=vkJEGucSg4Geqz30oxXM7oEersXXEKf3"
  ).then((r) => r.result.rows.map((r) => r.position_key));

  console.log("total positions", positionKeys.length);

  const batchSize = 500;
  const batchCount = Math.ceil(positionKeys.length / batchSize);
  const positionsWithAutoCancelOrders = [];

  for (let i = 0; i < batchCount; i++) {
    console.log("batch %s", i);
    const batch = positionKeys.slice(i * batchSize, (i + 1) * batchSize);
    const multicallReadParams = [];

    for (const positionKey of batch) {
      const listKey = getListKey(positionKey);
      multicallReadParams.push({
        target: dataStore.address,
        callData: dataStore.interface.encodeFunctionData("getBytes32Count", [listKey]),
      });
    }

    const response = await multicall.callStatic.aggregate3(multicallReadParams);
    for (const [j, item] of response.entries()) {
      const count = dataStore.interface.decodeFunctionResult("getBytes32Count", item.returnData)[0];
      if (count > 0) {
        const positionKey = positionKeys[i * batchSize + j];
        console.log("position with auto cancel", positionKey);
        positionsWithAutoCancelOrders.push(positionKey);
      }
    }
  }

  console.log("positionsWithAutoCancelOrders", positionsWithAutoCancelOrders);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
