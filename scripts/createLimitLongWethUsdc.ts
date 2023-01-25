import hre from "hardhat";

import { getMarketTokenAddress } from "../utils/market";
import { bigNumberify, expandDecimals } from "../utils/math";
import { WNT, ExchangeRouter, MintableToken } from "../typechain-types";
import { BaseOrderUtils } from "../typechain-types/contracts/router/ExchangeRouter";

const { ethers } = hre;

async function getValues(): Promise<{
  wnt: WNT;
}> {
  if (hre.network.name === "avalancheFuji") {
    return {
      wnt: await ethers.getContractAt("WNT", "0x1D308089a2D1Ced3f1Ce36B1FcaF815b07217be3"),
    };
  } else if (hre.network.name === "localhost") {
    return {
      wnt: await ethers.getContract("WETH"),
    };
  }

  throw new Error("unsupported network");
}

async function main() {
  const marketFactory = await ethers.getContract("MarketFactory");
  const roleStore = await ethers.getContract("RoleStore");
  const dataStore = await ethers.getContract("DataStore");
  const orderVault = await ethers.getContract("OrderVault");
  const exchangeRouter: ExchangeRouter = await ethers.getContract("ExchangeRouter");
  const router = await ethers.getContract("Router");

  const { wnt } = await getValues();
  const [wallet] = await ethers.getSigners();

  const executionFee = expandDecimals(1, 15);
  if ((await wnt.balanceOf(wallet.address)).lt(executionFee)) {
    console.log("depositing %s WNT", executionFee.toString());
    await wnt.deposit({ value: executionFee });
  }

  const wntAllowance = await wnt.allowance(wallet.address, router.address);
  console.log("WNT address %s symbol %s", wnt.address, await wnt.symbol());
  console.log("WNT allowance %s", wntAllowance.toString());
  if (wntAllowance.lt(executionFee)) {
    console.log("approving WNT");
    await wnt.approve(router.address, bigNumberify(2).pow(256).sub(1));
  }
  console.log("WNT balance %s", await wnt.balanceOf(wallet.address));

  const weth: MintableToken = await ethers.getContract("WETH");
  const longTokenAmount = expandDecimals(1, 16); // 0.01 weth
  const wethAllowance = await weth.allowance(wallet.address, router.address);
  console.log("weth address %s", weth.address);
  console.log("weth allowance %s", wethAllowance.toString());
  if (wethAllowance.lt(longTokenAmount)) {
    console.log("approving weth");
    await weth.approve(router.address, bigNumberify(2).pow(256).sub(1));
  }
  const wethBalance = await weth.balanceOf(wallet.address);
  console.log("weth balance %s", wethBalance);
  if (wethBalance.lt(longTokenAmount)) {
    console.log("minting %s weth", longTokenAmount);
    await weth.mint(wallet.address, longTokenAmount);
  }

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

  const params: BaseOrderUtils.CreateOrderParamsStruct = {
    addresses: {
      receiver: wallet.address,
      callbackContract: ethers.constants.AddressZero,
      market: wethUsdMarketAddress,
      initialCollateralToken: weth.address,
      swapPath: [],
    },
    numbers: {
      sizeDeltaUsd: expandDecimals(20, 30),
      triggerPrice: expandDecimals(11750000, 8), // $1175.0000, WETH oraclePrecision = 8 and 4 decimals
      acceptablePrice: expandDecimals(13000000, 8), // $1300
      executionFee,
      callbackGasLimit: 0,
      minOutputAmount: 0,
      initialCollateralDeltaAmount: 0,
    },
    orderType: 3, // LimitIncrease
    isLong: true, // not relevant for market swap
    shouldUnwrapNativeToken: false, // not relevant for market swap
    decreasePositionSwapType: 0, // no swap
  };
  console.log("exchange router %s", exchangeRouter.address);
  console.log("order store %s", orderVault.address);
  console.log("creating MarketIncrease order %s", JSON.stringify(params));

  const multicallArgs = [
    exchangeRouter.interface.encodeFunctionData("sendWnt", [orderVault.address, executionFee]),
    exchangeRouter.interface.encodeFunctionData("sendTokens", [weth.address, orderVault.address, longTokenAmount]),
    exchangeRouter.interface.encodeFunctionData("createOrder", [params, ethers.constants.HashZero]),
  ];
  console.log("multicall args", multicallArgs);

  const tx = await exchangeRouter.multicall(multicallArgs, {
    value: executionFee,
    gasLimit: 2500000,
  });

  console.log("transaction sent", tx.hash);
  await tx.wait();
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
