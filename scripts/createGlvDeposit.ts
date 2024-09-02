import hre from "hardhat";

import { bigNumberify, expandDecimals } from "../utils/math";

import { GlvRouter, MintableToken, WNT } from "../typechain-types";

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
  console.log("run createGlvDepositWethUsdc");
  const glvVault = await ethers.getContract("GlvVault");
  const glvRouter: GlvRouter = await ethers.getContract("GlvRouter");
  const router = await ethers.getContract("Router");

  const { wnt } = await getValues();

  const [wallet] = await ethers.getSigners();

  const executionFee = expandDecimals(2, 17); // 0.2 AVAX
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
  const longTokenAmount = expandDecimals(1, 17); // 0.1 weth
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
  const shortTokenAmount = expandDecimals(100, 6); // 100 USDC
  const usdcAllowance = await usdc.allowance(wallet.address, router.address);
  console.log("USDC address %s", usdc.address);
  console.log("USDC allowance %s", usdcAllowance.toString());
  if (usdcAllowance.lt(shortTokenAmount)) {
    console.log("approving USDC");
    await usdc.approve(router.address, bigNumberify(2).pow(256).sub(1));
  }
  const usdcBalance = await usdc.balanceOf(wallet.address);
  console.log("USDC balance %s", usdcBalance);
  if (usdcBalance.lt(shortTokenAmount)) {
    console.log("minting %s USDC", shortTokenAmount);
    await usdc.mint(wallet.address, shortTokenAmount);
  }

  //   const wethUsdMarketAddress = await getMarketTokenAddress(
  //     weth.address,
  //     weth.address,
  //     usdc.address,
  //     DEFAULT_MARKET_TYPE,
  //     marketFactory.address,
  //     roleStore.address,
  //     dataStore.address
  //   );

  // "longTokenAddress":"0x82F0b3695Ed2324e55bbD9A9554cB4192EC3a514"
  // "shortTokenAddress":"0x3eBDeaA0DB3FfDe96E7a0DBBAFEC961FC50F725F

  const params = {
    glv: "0xDD06Cd6694FeB4222FD1a4146d118078D672d7EB",
    market: "0xbf338a6C595f06B7Cfff2FA8c958d49201466374", // ETHUSD
    receiver: wallet.address,
    callbackContract: ethers.constants.AddressZero,
    uiFeeReceiver: ethers.constants.AddressZero,
    initialLongToken: weth.address,
    initialShortToken: usdc.address,
    longTokenSwapPath: [],
    shortTokenSwapPath: [],
    minGlvTokens: 0,
    executionFee: executionFee,
    callbackGasLimit: 0,
    shouldUnwrapNativeToken: false,
    isMarketTokenDeposit: false,
  };
  console.log("glv router %s", glvRouter.address);
  console.log("deposit store %s", glvVault.address);
  console.log("creating glv deposit %s", JSON.stringify(params));

  const multicallArgs = [
    glvRouter.interface.encodeFunctionData("sendWnt", [glvVault.address, executionFee]),
    glvRouter.interface.encodeFunctionData("sendTokens", [weth.address, glvVault.address, longTokenAmount]),
    glvRouter.interface.encodeFunctionData("sendTokens", [usdc.address, glvVault.address, shortTokenAmount]),
    glvRouter.interface.encodeFunctionData("createGlvDeposit", [params]),
  ];
  console.log("multicall args", multicallArgs);

  const tx = await glvRouter.multicall(multicallArgs, {
    value: executionFee,
    gasLimit: 2500000,
  });

  console.log("transaction sent", tx.hash);
  await tx.wait();
  console.log("receipt received");
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
