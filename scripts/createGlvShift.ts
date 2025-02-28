import hre from "hardhat";

import { GlvHandler } from "../typechain-types";
import { expandDecimals } from "../utils/math";
import { BigNumber } from "ethers";

const { ethers } = hre;
async function main() {
  console.log("run createGlvShift");
  const glvHandler: GlvHandler = await ethers.getContract("GlvHandler");

  const glv = process.env.GLV;
  if (!glv) {
    throw new Error("GLV is required");
  }

  const marketTokenAmountArg = process.env.MARKET_TOKEN_AMOUNT;
  if (!marketTokenAmountArg) {
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

  let marketTokenAmount: BigNumber;
  if (marketTokenAmountArg === "ALL") {
    const marketToken = await ethers.getContractAt("MarketToken", fromMarket);
    marketTokenAmount = await marketToken.balanceOf(glv);
  } else {
    marketTokenAmount = expandDecimals(marketTokenAmountArg, 18);
  }

  const params = {
    glv,
    fromMarket,
    toMarket,
    marketTokenAmount,
    minMarketTokens: 0,
  };
  console.log("glv: %s", glv);
  console.log("fromMarket: %s", fromMarket);
  console.log("toMarket: %s", toMarket);
  console.log("marketTokenAmount: %s (%s)", marketTokenAmountArg, params.marketTokenAmount);
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
