import hre from "hardhat";

import { getMarketTokenAddress } from "../utils/market";
import { createDeposit } from "../utils/deposit";
import { expandDecimals } from "../utils/math";

const { ethers } = hre;

async function main() {
  const depositStore = await ethers.getContract("DepositStore");
  const depositHandler = await ethers.getContract("DepositHandler");
  const marketFactory = await ethers.getContract("MarketFactory");
  const roleStore = await ethers.getContract("RoleStore");
  const marketStore = await ethers.getContract("MarketStore");
  const weth = await ethers.getContract("WETH");
  const usdc = await ethers.getContract("USDC");
  const ethUsdMarketAddress = await getMarketTokenAddress(
    weth.address,
    weth.address,
    usdc.address,
    marketFactory.address,
    roleStore.address
  );
  const ethUsdMarket = await marketStore.get(ethUsdMarketAddress);

  const [wallet, user0, user1] = await ethers.getSigners();
  const fixture = {
    contracts: {
      depositStore,
      depositHandler,
      ethUsdMarket,
      wnt: weth,
    },
    accounts: {
      wallet,
      user0,
    },
  };

  await createDeposit(fixture, {
    receiver: user1,
    market: ethUsdMarket,
    longTokenAmount: expandDecimals(10, 18),
    shortTokenAmount: expandDecimals(10 * 5000, 6),
    minMarketTokens: 100,
    shouldUnwrapNativeToken: true,
    executionFee: "500",
    callbackGasLimit: "200000",
    gasUsageLabel: "createDeposit",
  });
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
