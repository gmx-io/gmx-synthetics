import hre from "hardhat";
import { BigNumber } from "ethers";
import { ERC20, IStargate } from "../../typechain-types";

import { Options } from "@layerzerolabs/lz-v2-utilities";

import { expandDecimals } from "../../utils/math";

const { ethers } = hre;

// Sepolia
const STARGATE_POOL_USDC_SEPOLIA = "0x4985b8fcEA3659FD801a5b857dA1D00e985863F0";
const GM_OFT = "0xe4EBcAC4a2e6CBEE385eE407f7D5E278Bc07e11e";
const GLV_OFT = "0xD5BdEa6dC8E4B7429b72675386fC903DEf06599d";

// ArbitrumSepolia
const DST_EID = 40231;

const layerZeroProviderJson = import("../../deployments/arbitrumSepolia/LayerZeroProvider.json");

async function getComposedMsg({ account }: { account: string }): Promise<string> {
  return ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [account, "0x"]);
}

async function prepareSend(
  amount: number | string | BigNumber,
  composeMsg: string,
  stargatePoolAddress: string,
  decimals: number,
  gasLimit = 500000,
  extraGasForLzCompose = 500000,
  slippageBps = 100 // Default 1% slippage tolerance
) {
  // Calculate msgValue for lzReceive on destination chain
  // e.g. 50,000 gas * 0.1 gwei (100,000,000 wei) = 5,000,000,000,000 wei
  const destProvider = new ethers.providers.JsonRpcProvider("https://sepolia-rollup.arbitrum.io/rpc");
  const gasPrice = await destProvider.getGasPrice();
  const msgValue = extraGasForLzCompose * gasPrice.toNumber();
  const extraOptions = Options.newOptions().addExecutorComposeOption(0, gasLimit, msgValue);

  const stargatePool: IStargate = await ethers.getContractAt("IStargate", stargatePoolAddress);
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
    to: ethers.utils.hexZeroPad(ethers.utils.hexlify((await layerZeroProviderJson).address), 32),
    amountLD: amount,
    minAmountLD: minAmountLD, // Apply slippage tolerance
    extraOptions: extraOptions.toHex(),
    composeMsg: composeMsg || "0x",
    oftCmd: "0x",
  };
  const messagingFee = await stargatePool.quoteSend(sendParam, false);
  let valueToSend = messagingFee.nativeFee;
  const tokenAddress = await stargatePool.token();
  if (tokenAddress === ethers.constants.AddressZero) {
    valueToSend = valueToSend.add(sendParam.amountLD);
  }
  console.log(`valueToSend: ${ethers.utils.formatUnits(valueToSend)} ETH`);
  return {
    valueToSend,
    sendParam,
    messagingFee,
    stargatePool,
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
  if (txCost.gt(balance)) {
    throw new Error(`Insufficient funds for tx: need ${txCost} but have ${balance} ETH`);
  }

  return { gasPrice, gasLimit };
}

async function checkBalance({ account, token, amount }) {
  console.log(`Checking balance for account: ${account} and ${process.env.TOKEN} token: ${token.address}`);
  const balance = await token.balanceOf(account);
  if (balance.lt(amount)) {
    throw new Error(`Insufficient balance. Need ${amount} but have ${balance}`);
  }
}

async function checkAllowance({ account, token, spender, amount }) {
  console.log(`Checking allowance for account: ${account} on spender: ${spender}`);
  const allowance = await token.allowance(account, spender);
  if (allowance.lt(amount)) {
    await (await token.approve(spender, amount)).wait();
    console.log(`Allowance is now: ${await token.allowance(account, spender)}`);
  }
}

// TOKEN=<USDC/GM/GLV> AMOUNT=<number> npx hardhat run --network sepolia scripts/multichain/bridgeInCrossChain.ts
// TOKEN=USDC npx hardhat run --network sepolia scripts/multichain/bridgeInCrossChain.ts
async function main() {
  const [wallet] = await hre.ethers.getSigners();
  const account = wallet.address;

  let amount: BigNumber;
  let valueToSend;
  let sendParam;
  let messagingFee;
  let stargatePool;
  const composedMsg = await getComposedMsg({ account });

  if (process.env.TOKEN === "USDC") {
    amount = expandDecimals(Number(process.env.AMOUNT) || 50, 6); // 50 USDC
    ({ valueToSend, sendParam, messagingFee, stargatePool } = await prepareSend(
      amount,
      composedMsg,
      STARGATE_POOL_USDC_SEPOLIA,
      6
    ));
  } else if (process.env.TOKEN === "GM") {
    amount = expandDecimals(Number(process.env.AMOUNT) || 10, 18); // 10 GM
    ({ valueToSend, sendParam, messagingFee, stargatePool } = await prepareSend(amount, composedMsg, GM_OFT, 18));
  } else if (process.env.TOKEN === "GLV") {
    amount = expandDecimals(Number(process.env.AMOUNT) || 10, 18); // 10 GLV
    ({ valueToSend, sendParam, messagingFee, stargatePool } = await prepareSend(amount, composedMsg, GLV_OFT, 18));
  } else {
    throw new Error("⚠️ Unsupported TOKEN type. Use 'USDC', 'GM', or 'GLV'.");
  }

  const token: ERC20 = await ethers.getContractAt("ERC20", await stargatePool.token());
  await checkBalance({ account, token, amount });
  await checkAllowance({ account, token, spender: stargatePool.address, amount });

  const { gasPrice, gasLimit } = await getIncreasedValues({
    sendParam,
    messagingFee,
    account,
    valueToSend,
    stargatePool,
  });

  const tx = await stargatePool.sendToken(sendParam, messagingFee, account /* refundAddress */, {
    value: valueToSend,
    gasLimit,
    gasPrice,
  });

  console.log("Bridge in tx:", tx.hash);
  await tx.wait();
  console.log("Tx receipt received");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
