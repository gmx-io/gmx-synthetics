import hre from "hardhat";
import { ERC20, IStargate } from "../../typechain-types";
const { ethers } = hre;

import { Options } from "@layerzerolabs/lz-v2-utilities";

import { expandDecimals } from "../../utils/math";
import { BigNumber } from "ethers";

// SrcChain
const SRC_CHAIN_ID = 11155111; // Sepolia
const STARGATE_USDC = "0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590"; // Sepolia
const STARGATE_POOL_USDC = "0x4985b8fcEA3659FD801a5b857dA1D00e985863F0"; // Sepolia
const STARGATE_POOL_NATIVE = "0x9Cc7e185162Aa5D1425ee924D97a87A0a34A0706"; // Sepolia
// ArbitrumSepolia
const DST_EID = 40231; // ArbitrumSepolia
const layerZeroProvider = import("../../deployments/arbitrumSepolia/LayerZeroProvider.json"); // ArbitrumSepolia

async function prepareSend(
  amount: number | string | BigNumber,
  composeMsg: string,
  stargatePoolAddress: string,
  decimals: number,
  extraGas = 500000,
  slippageBps = 100 // Default 1% slippage tolerance
) {
  const stargateContract: IStargate = await ethers.getContractAt("IStargate", stargatePoolAddress);

  const extraOptions = Options.newOptions().addExecutorComposeOption(0, extraGas /*, 0*/);
  console.log(`extraOptions: ${extraOptions.toHex()}`);

  // Calculate minAmountLD with slippage tolerance
  const amountBN = BigNumber.from(amount);
  const minAmountLD = amountBN.sub(amountBN.mul(slippageBps).div(10000)); // without this --> Fails with Stargate_SlippageTooHigh
  console.log(
    `Bridging amount: ${ethers.utils.formatUnits(amount, decimals)}, Min Amount (with ${
      slippageBps / 100
    }% slippage): ${ethers.utils.formatUnits(minAmountLD, decimals)}`
  );

  const sendParam = {
    dstEid: DST_EID,
    to: ethers.utils.hexZeroPad(ethers.utils.hexlify((await layerZeroProvider).address), 32),
    amountLD: amount,
    minAmountLD: minAmountLD, // Apply slippage tolerance
    extraOptions: extraOptions.toHex(),
    composeMsg: composeMsg || "0x",
    oftCmd: "0x",
  };

  const messagingFee = await stargateContract.quoteSend(sendParam, false);

  let valueToSend = messagingFee.nativeFee;
  const tokenAddress = await stargateContract.token();
  if (tokenAddress === ethers.constants.AddressZero) {
    valueToSend = valueToSend.add(sendParam.amountLD);
  }
  console.log(`valueToSend: ${ethers.utils.formatUnits(valueToSend)} ETH`);

  return {
    valueToSend,
    sendParam,
    messagingFee,
    stargateContract,
  };
}

async function getIncreasedValues({
  sendParam,
  messagingFee,
  account,
  valueToSend,
  stargatePool,
  pricePercentage = 20,
  limitPercentage = 30,
}) {
  // Get current gas price and increase it by a smaller percentage to avoid high costs
  const feeData = await ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice.mul(pricePercentage + 100).div(100);
  console.log("Gas price: ", ethers.utils.formatUnits(gasPrice, "gwei"), "gwei");

  // Get account balance for comparison
  const balance = await ethers.provider.getBalance(account);
  console.log("Account balance: ", ethers.utils.formatEther(balance), "ETH");

  // Estimate gas for transaction
  let gasLimit = await stargatePool.estimateGas
    .sendToken(
      sendParam,
      messagingFee,
      account, // refundAddress
      { value: valueToSend }
    )
    .catch((e) => {
      console.log("Gas estimation failed, using fallback gas limit");
      return BigNumber.from(1000000); // More reasonable fallback gas limit
    });

  gasLimit = gasLimit.mul(limitPercentage + 100).div(100);

  const txCost = gasLimit.mul(gasPrice).add(messagingFee.nativeFee);
  console.log("Estimated transaction cost: ", ethers.utils.formatEther(txCost), "ETH");

  if (txCost.gt(balance)) {
    console.error(
      `Insufficient funds: need ${ethers.utils.formatEther(txCost)} ETH but have ${ethers.utils.formatEther(
        balance
      )} ETH`
    );
    throw new Error("Insufficient funds for transaction");
  }

  return { gasPrice, gasLimit };
}

async function checkAllowance({ account, amount, usdc }) {
  const allowance = await usdc.allowance(account, STARGATE_POOL_USDC);
  if (allowance.lt(amount)) {
    await (await usdc.approve(STARGATE_POOL_USDC, amount)).wait();
    console.log(
      `Allowance is now: ${ethers.utils.formatUnits(await usdc.allowance(account, STARGATE_POOL_USDC), 6)} USDC`
    );
  }
}

// source .env (contains ACCOUNT_KEY)
// npx hardhat run --network sepolia scripts/multichain/bridgeIn.ts
async function main() {
  const [wallet] = await hre.ethers.getSigners();
  const account = wallet.address;
  const data = "0x"; // encoded actionType and actionData
  const composedMsg = ethers.utils.defaultAbiCoder.encode(
    ["address", "uint256", "bytes"],
    [account, SRC_CHAIN_ID, data]
  );

  const usdcAmount = expandDecimals(25, 6); // USDC
  const ethAmount = expandDecimals(1, 16); // 0.01 ETH

  // Bridge USDC
  const usdc: ERC20 = await ethers.getContractAt("ERC20", STARGATE_USDC);
  const usdcBalance = await usdc.balanceOf(account);
  if (usdcBalance.gte(usdcAmount)) {
    console.log("USDC balance: %s, USDC amount: %s", ethers.utils.formatUnits(usdcBalance, 6), usdcAmount);
    await checkAllowance({ account, amount: usdcAmount, usdc });
    const { valueToSend, sendParam, messagingFee, stargateContract } = await prepareSend(
      usdcAmount,
      composedMsg,
      STARGATE_POOL_USDC,
      6
    );

    const { gasPrice, gasLimit } = await getIncreasedValues({
      sendParam,
      messagingFee,
      account,
      valueToSend,
      stargatePool: stargateContract,
    });

    const tx = await stargateContract.sendToken(sendParam, messagingFee, account /* refundAddress */, {
      value: valueToSend,
      gasLimit,
      gasPrice,
    });

    console.log("USDC transaction sent", tx.hash);
    await tx.wait();
    console.log("USDC receipt received");
  }

  // Bridge ETH
  const ethBalance = await ethers.provider.getBalance(account);
  if (ethBalance.gte(ethAmount)) {
    console.log("ETH balance: %s, ETH amount: %s", ethers.utils.formatUnits(ethBalance, 18), ethAmount);
    const { valueToSend, sendParam, messagingFee, stargateContract } = await prepareSend(
      ethAmount,
      composedMsg,
      STARGATE_POOL_NATIVE,
      18
    );

    const { gasPrice, gasLimit } = await getIncreasedValues({
      sendParam,
      messagingFee,
      account,
      valueToSend,
      stargatePool: stargateContract,
    });

    const tx = await stargateContract.sendToken(sendParam, messagingFee, account /* refundAddress */, {
      value: valueToSend,
      gasLimit,
      gasPrice,
    });

    console.log("ETH transaction sent", tx.hash);
    await tx.wait();
    console.log("ETH receipt received");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
