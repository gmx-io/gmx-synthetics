import hre from "hardhat";

import { GlvShiftHandler } from "../typechain-types";

const { ethers } = hre;
async function main() {
  console.log("run createGlvShift");
  const glvShiftHandler: GlvShiftHandler = await ethers.getContract("GlvShiftHandler");

  const glv = process.env.GLV;
  if (!glv) {
    throw new Error("GLV is required");
  }
  const market = process.env.MARKET;
  if (!market) {
    throw new Error("MARKET is required");
  }

  console.log("glv: %s", glv);
  console.log("market: %s", market);
  console.log("glv handler %s", glvShiftHandler.address);

  if (process.env.WRITE === "true") {
    console.log("sending real transaction...");
    const tx = await glvShiftHandler.removeMarketFromGlv(glv, market);

    console.log("transaction sent", tx.hash);
    await tx.wait();
    console.log("receipt received");
  } else {
    console.log("running simulation...");
    const result = await glvShiftHandler.callStatic.removeMarketFromGlv(glv, market);
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
