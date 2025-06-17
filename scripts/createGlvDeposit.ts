import hre from "hardhat";

import { bigNumberify, expandDecimals } from "../utils/math";

import { GlvRouter, MintableToken, WNT } from "../typechain-types";

const { ethers } = hre;

const STARGATE_USDC_ARB_SEPOLIA = "0x3253a335E7bFfB4790Aa4C25C4250d206E9b9773";
const WETH_ARB_SEPOLIA = "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73";

async function getValues(): Promise<{
  wnt: WNT;
}> {
  if (hre.network.name === "arbitrumSepolia") {
    return {
      wnt: await ethers.getContractAt("WNT", WETH_ARB_SEPOLIA),
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

  const executionFee = expandDecimals(2, 16); // 0.02 ETH
  const longTokenAmount = expandDecimals(1, 17); // 0.1 weth
  const shortTokenAmount = expandDecimals(300, 6); // 300 USDC

  if ((await wnt.balanceOf(wallet.address)).lt(executionFee.add(longTokenAmount))) {
    console.log("depositing %s WNT", executionFee.add(longTokenAmount).toString());
    await wnt.deposit({ value: executionFee.add(longTokenAmount) });
  }

  const wntAllowance = await wnt.allowance(wallet.address, router.address);
  console.log("WNT address %s symbol %s", wnt.address, await wnt.symbol());
  console.log("WNT allowance %s", wntAllowance.toString());
  if (wntAllowance.lt(executionFee)) {
    console.log("approving WNT");
    await wnt.approve(router.address, bigNumberify(2).pow(256).sub(1));
  }
  console.log("WNT balance %s", await wnt.balanceOf(wallet.address));

  // const weth: MintableToken = await ethers.getContract("WETH");
  // const longTokenAmount = expandDecimals(1, 17); // 0.1 weth
  // const wethAllowance = await weth.allowance(wallet.address, router.address);
  // console.log("weth address %s", weth.address);
  // console.log("weth allowance %s", wethAllowance.toString());
  // if (wethAllowance.lt(longTokenAmount)) {
  //   console.log("approving weth");
  //   await weth.approve(router.address, bigNumberify(2).pow(256).sub(1));
  // }
  // const wethBalance = await weth.balanceOf(wallet.address);
  // console.log("weth balance %s", wethBalance);
  // if (wethBalance.lt(longTokenAmount)) {
  //   console.log("minting %s weth", longTokenAmount);
  //   await weth.mint(wallet.address, longTokenAmount);
  // }

  const usdc: MintableToken = await ethers.getContractAt("MintableToken", STARGATE_USDC_ARB_SEPOLIA);
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

  const params = {
    addresses: {
      glv: "0xAb3567e55c205c62B141967145F37b7695a9F854",
      market: "0xb6fC4C9eB02C35A134044526C62bb15014Ac0Bcc", // { indexToken: "WETH", longToken: "WETH", shortToken: "USDC.SG" }
      // market: "0xAde9D177B9E060D2064ee9F798125e6539fDaA1c", // { indexToken: "CRV", longToken: "WETH", shortToken: "USDC.SG" }
      receiver: wallet.address,
      callbackContract: ethers.constants.AddressZero,
      uiFeeReceiver: ethers.constants.AddressZero,
      initialLongToken: wnt.address,
      initialShortToken: usdc.address,
      longTokenSwapPath: [],
      shortTokenSwapPath: [],
    },
    minGlvTokens: 0,
    executionFee: executionFee,
    callbackGasLimit: 0,
    shouldUnwrapNativeToken: false,
    isMarketTokenDeposit: false,
    dataList: [],
  };
  console.log("glv router %s", glvRouter.address);
  console.log("deposit store %s", glvVault.address);
  console.log("creating glv deposit %s", JSON.stringify(params));

  const multicallArgs = [
    glvRouter.interface.encodeFunctionData("sendWnt", [glvVault.address, executionFee]),
    glvRouter.interface.encodeFunctionData("sendTokens", [wnt.address, glvVault.address, longTokenAmount]),
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
