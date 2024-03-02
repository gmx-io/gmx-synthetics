import hre from "hardhat";

const { ethers } = hre;

import OrderHandler from "../artifacts/contracts/exchange/OrderHandler.sol/OrderHandler.json";

import { toLoggableObject } from "../utils/print";

let data = process.env.DATA;
const value = process.env.VALUE;

async function main() {
  data = data.toLocaleLowerCase();
  if (!data.startsWith("0x")) {
    data = "0x" + data;
  }

  const orderHandlerInterface = new ethers.utils.Interface(OrderHandler.abi);

  const result = orderHandlerInterface.parseTransaction({ data, value });
  console.log("result", toLoggableObject(result.args));
  if (result.args.oracleParams?.realtimeFeedData) {
    const { realtimeFeedData } = result.args.oracleParams;
    for (let i = 0; i < realtimeFeedData.length; i++) {
      const oracleData = ethers.utils.defaultAbiCoder.decode(
        ["bytes32[3]", "bytes", "bytes32[]", "bytes32[]", "bytes32"],
        realtimeFeedData[i]
      );
      const oracleValues = ethers.utils.defaultAbiCoder.decode(
        ["bytes32", "uint32", "int192", "int192", "int192", "uint64", "bytes32", "uint64", "uint64"],
        oracleData[1]
      );
      console.log(`realtimeFeedData ${i}`);
      console.log(`    feedId: ${oracleValues[0].toString()}`);
      console.log(`    observationsTimestamp: ${oracleValues[1].toString()}`);
      console.log(`    median: ${oracleValues[2].toString()}`);
      console.log(`    bid: ${oracleValues[3].toString()}`);
      console.log(`    ask: ${oracleValues[4].toString()}`);
      console.log(`    blocknumberUpperBound: ${oracleValues[5].toString()}`);
      console.log(`    upperBlockhash: ${oracleValues[6].toString()}`);
      console.log(`    blocknumberLowerBound: ${oracleValues[7].toString()}`);
      console.log(`    currentBlockTimestamp: ${oracleValues[8].toString()}`);
      console.log(
        "oracleValues",
        oracleValues.map((i) => i.toString())
      );
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
