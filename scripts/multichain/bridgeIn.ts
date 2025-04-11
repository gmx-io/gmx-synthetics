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
// ArbitrumSepolia
const DST_EID = 40231; // ArbitrumSepolia
const LAYERZERO_PROVIDER = "0xa132826C0D28f6626534b1Ca6fD7b2c32dd289e5"; // ArbitrumSepolia

async function prepareSend(
  amount: number | string | BigNumber,
  composeMsg: string,
  extraGas = 500000,
  slippageBps = 100 // Default 1% slippage tolerance
) {
  const stargateContract: IStargate = await ethers.getContractAt("IStargate", STARGATE_POOL_USDC);

  const extraOptions = Options.newOptions().addExecutorComposeOption(0, extraGas /*, 0*/);
  console.log(`extraOptions: ${extraOptions.toHex()}`);

  // Calculate minAmountLD with slippage tolerance
  const amountBN = BigNumber.from(amount);
  const minAmountLD = amountBN.sub(amountBN.mul(slippageBps).div(10000)); // without this --> Fails with Stargate_SlippageTooHigh
  console.log(
    `Bridging amount: ${ethers.utils.formatUnits(amount, 6)}, Min Amount (with ${
      slippageBps / 100
    }% slippage): ${ethers.utils.formatUnits(minAmountLD, 6)}`
  );

  const sendParam = {
    dstEid: DST_EID,
    to: ethers.utils.hexZeroPad(ethers.utils.hexlify(LAYERZERO_PROVIDER), 32),
    amountLD: amount,
    minAmountLD: minAmountLD, // Apply slippage tolerance
    extraOptions: extraOptions.toHex(),
    composeMsg: composeMsg || "0x", // Ensure composeMsg is never empty string
    oftCmd: "0x", // Use "0x" instead of empty string
  };
  // console.log("sendParam: ", sendParam);

  // Get messaging fee
  const messagingFee = await stargateContract.quoteSend(sendParam, false);
  // console.log("messagingFee: ", messagingFee);

  let valueToSend = messagingFee.nativeFee;
  // Check if the token is native (ETH)
  const tokenAddress = await stargateContract.token();
  if (tokenAddress === ethers.constants.AddressZero) {
    valueToSend = valueToSend.add(sendParam.amountLD);
  }
  console.log(`valueToSend: ${ethers.utils.formatUnits(valueToSend)} ETH`);

  return {
    valueToSend,
    sendParam,
    messagingFee,
  };
}

async function getIncreasedValues({
  sendParam,
  messagingFee,
  account,
  valueToSend,
  stargatePoolUSDC,
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
  let gasLimit = await stargatePoolUSDC.estimateGas
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

async function checkAllowance({ account, amount }) {
  const usdc: ERC20 = await ethers.getContractAt("ERC20", STARGATE_USDC);
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
  const amount = expandDecimals(10, 6); // USDC
  const [wallet] = await hre.ethers.getSigners();
  const account = wallet.address;
  await checkAllowance({ account, amount });

  const stargatePoolUSDC: IStargate = await ethers.getContractAt("IStargate", STARGATE_POOL_USDC);
  const composedMsg = ethers.utils.defaultAbiCoder.encode(["address", "uint256"], [account, SRC_CHAIN_ID]);
  const { valueToSend, sendParam, messagingFee } = await prepareSend(amount, composedMsg);
  const { gasPrice, gasLimit } = await getIncreasedValues({
    sendParam,
    messagingFee,
    account,
    valueToSend,
    stargatePoolUSDC,
  });

  const tx = await stargatePoolUSDC.sendToken(sendParam, messagingFee, account /* refundAddress */, {
    value: valueToSend,
    gasLimit,
    gasPrice,
  });

  console.log("transaction sent", tx.hash);
  await tx.wait();
  console.log("receipt received");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
