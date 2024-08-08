import hre from "hardhat";

import { getMarketTokenAddress, DEFAULT_MARKET_TYPE } from "../utils/market";
import { bigNumberify, expandDecimals } from "../utils/math";
import { WNT, ExchangeRouter, MintableToken } from "../typechain-types";
import { IBaseOrderUtils } from "../typechain-types/contracts/router/ExchangeRouter";

const { ethers } = hre;

async function getValues(): Promise<{
  wnt: WNT;
}> {
  if (hre.network.name === "avalancheFuji") {
    return {
      wnt: await ethers.getContractAt("WNT", "0x1D308089a2D1Ced3f1Ce36B1FcaF815b07217be3"),
    };
  }

  throw new Error("unsupported network");
}

async function main() {
  const orderVault = await ethers.getContract("OrderVault");
  const exchangeRouter: ExchangeRouter = await ethers.getContract("ExchangeRouter");
  const router = await ethers.getContract("Router");

  const { wnt } = await getValues();
  const [wallet] = await ethers.getSigners();

  const executionFee = expandDecimals(2, 17);
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

  const usdc: MintableToken = await ethers.getContract("USDC");
  const tokenAmount = expandDecimals(5, 6); // 5 USDC
  const usdcAllowance = await usdc.allowance(wallet.address, router.address);
  console.log("usdc address %s", usdc.address);
  console.log("usdc allowance %s", usdcAllowance.toString());
  if (usdcAllowance.lt(tokenAmount)) {
    console.log("approving usdc");
    await usdc.approve(router.address, bigNumberify(2).pow(256).sub(1));
  }
  const usdcBalance = await usdc.balanceOf(wallet.address);
  console.log("usdc balance %s", usdcBalance);
  if (usdcBalance.lt(tokenAmount)) {
    console.log("minting %s usdc", tokenAmount);
    await usdc.mint(wallet.address, tokenAmount);
  }

  const market = "0xbf338a6C595f06B7Cfff2FA8c958d49201466374";
  console.log("market %s", market);

  // based on failed order 0xc1fc90672000b67b64e1a548a4a078f957de75f9cad9d438a1ebdf5e95129a35
  const params: IBaseOrderUtils.CreateOrderParamsStruct = {
    addresses: {
      receiver: wallet.address,
      cancellationReceiver: ethers.constants.AddressZero,
      uiFeeReceiver: ethers.constants.AddressZero,
      callbackContract: ethers.constants.AddressZero,
      market: market,
      initialCollateralToken: "0x3eBDeaA0DB3FfDe96E7a0DBBAFEC961FC50F725F",
      swapPath: ["0xCc6AC193E1d1Ef102eCBBA864BBfE87E414a7A0D"],
    },
    numbers: {
      sizeDeltaUsd: expandDecimals(20, 30),
      triggerPrice: 0, // WETH oraclePrecision = 8
      acceptablePrice: 0,
      executionFee,
      callbackGasLimit: 0,
      minOutputAmount: 0,
      initialCollateralDeltaAmount: 0,
    },
    orderType: 2, // MarketIncrease
    isLong: false,
    shouldUnwrapNativeToken: false, // not relevant for market swap
    decreasePositionSwapType: 0, // no swap
    autoCancel: true,
    referralCode: ethers.constants.HashZero,
  };
  console.log("exchange router %s", exchangeRouter.address);
  console.log("order store %s", orderVault.address);
  console.log("creating MarketIncrease order %s", JSON.stringify(params));

  const multicallArgs = [
    exchangeRouter.interface.encodeFunctionData("sendWnt", [orderVault.address, executionFee]),
    exchangeRouter.interface.encodeFunctionData("sendTokens", [usdc.address, orderVault.address, tokenAmount]),
    exchangeRouter.interface.encodeFunctionData("createOrder", [params]),
  ];
  console.log("multicall args", multicallArgs);

  const result = await exchangeRouter.callStatic.multicall(multicallArgs, {
    value: executionFee,
    gasLimit: 2500000,
  });

  console.log("result", result);

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
