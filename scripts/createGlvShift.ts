import hre from "hardhat";

import { GlvHandler } from "../typechain-types";
import { expandDecimals } from "../utils/math";

const { ethers } = hre;
async function main() {
  console.log("run createGlvShift");
  const glvHandler: GlvHandler = await ethers.getContract("GlvHandler");

  const glv = process.env.GLV;
  if (!glv) {
    throw new Error("GLV is required");
  }

  const marketTokenAmount = process.env.MARKET_TOKEN_AMOUNT;
  if (!marketTokenAmount) {
    throw new Error("MARKET_TOKEN_AMOUNT is required");
  }

  const fromMarket = process.env.FROM_MARKET;
  if (!fromMarket) {
    throw new Error("FROM_MARKET is required");
  }

  const toMarket = process.env.TO_MARKET;
  if (!toMarket) {
    throw new Error("TO_MARKET is required");
  }

  const params = {
    glv,
    fromMarket,
    toMarket,
    marketTokenAmount: expandDecimals(marketTokenAmount, 18),
    minMarketTokens: 0,
  };
  console.log("glv: %s", glv);
  console.log("fromMarket: %s", fromMarket);
  console.log("toMarket: %s", toMarket);
  console.log("marketTokenAmount: %s (%s)", marketTokenAmount, params.marketTokenAmount);
  console.log("glv handler %s", glvHandler.address);

  if (process.env.WRITE === "true") {
    console.log("sending real transaction...");
    const tx = await glvHandler.createGlvShift(params);

    console.log("transaction sent", tx.hash);
    await tx.wait();
    console.log("receipt received");
  } else {
    console.log("running simulation...");
    const result = await glvHandler.callStatic.createGlvShift(params);
    console.log("done. result: %s", result);
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
