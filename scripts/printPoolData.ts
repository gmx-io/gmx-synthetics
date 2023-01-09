import hre from "hardhat";

import * as keys from "../utils/keys";

import { getMarketTokenAddress } from "../utils/market";

import { MintableToken } from "../typechain-types";

const { ethers } = hre;

async function main() {
  const marketFactory = await ethers.getContract("MarketFactory");
  const roleStore = await ethers.getContract("RoleStore");
  const dataStore = await ethers.getContract("DataStore");
  const weth: MintableToken = await ethers.getContract("WETH");
  const usdc: MintableToken = await ethers.getContract("USDC");

  const wethUsdMarketAddress = await getMarketTokenAddress(
    weth.address,
    weth.address,
    usdc.address,
    marketFactory.address,
    roleStore.address,
    dataStore.address
  );
  console.log("market %s", wethUsdMarketAddress);

  const poolAmountA = await dataStore.getUint(keys.poolAmountKey(wethUsdMarketAddress, weth.address));
  console.log("poolAmountA %s %s %s", poolAmountA.toString(), "WETH", weth.address);

  const poolAmountB = await dataStore.getUint(keys.poolAmountKey(wethUsdMarketAddress, usdc.address));
  console.log("poolAmountB %s", poolAmountB.toString(), "USDC", usdc.address);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
