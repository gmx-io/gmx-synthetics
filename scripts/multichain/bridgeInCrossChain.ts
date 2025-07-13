import hre from "hardhat";
import { BigNumber } from "ethers";
import { ERC20, IOFT } from "../../typechain-types";

import { Options } from "@layerzerolabs/lz-v2-utilities";

import { expandDecimals } from "../../utils/math";
import {
  checkAllowance,
  checkBalance,
  getDeployments,
  getIncreasedValues,
  logEthBalance,
  logMultichainBalance,
  logTokenBalance,
} from "./utils";
import * as keys from "../../utils/keys";

const { ethers } = hre;

// IOFT vs. IStargate
// IOFT is being used since it's more general, but IStargate has identical
// interface, tho only difference being the additional `sendToken` method

// Sepolia
const STARGATE_POOL_USDC_SEPOLIA = "0x4985b8fcEA3659FD801a5b857dA1D00e985863F0";
const GM_OFT = "0xe4EBcAC4a2e6CBEE385eE407f7D5E278Bc07e11e";
const GLV_OFT = "0xD5BdEa6dC8E4B7429b72675386fC903DEf06599d";
const STARGATE_POOL_NATIVE_SEPOLIA = "0x9Cc7e185162Aa5D1425ee924D97a87A0a34A0706";

// ArbitrumSepolia
const DST_EID = 40231;
const STARGATE_USDC_ARB_SEPOLIA = "0x3253a335E7bFfB4790Aa4C25C4250d206E9b9773";
const ETH_USD_MARKET_TOKEN = "0xb6fC4C9eB02C35A134044526C62bb15014Ac0Bcc"; // GM { indexToken: "WETH", longToken: "WETH", shortToken: "USDC.SG" }
const ETH_USD_GLV_ADDRESS = "0xAb3567e55c205c62B141967145F37b7695a9F854"; // GMX Liquidity Vault [WETH-USDC.SG]

const layerZeroProviderJson = import("../../deployments/arbitrumSepolia/LayerZeroProvider.json");

async function getComposedMsg({ account }: { account: string }): Promise<string> {
  return ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [account, "0x"]);
}

async function prepareSend(
  amount: number | string | BigNumber,
  composeMsg: string,
  oftAddress: string,
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
  const extraOptions = Options.newOptions()
    .addExecutorLzReceiveOption(gasLimit, 0)
    .addExecutorComposeOption(0, gasLimit, msgValue);

  const oft: IOFT = await ethers.getContractAt("IOFT", oftAddress);
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
  const messagingFee = await oft.quoteSend(sendParam, false);
  let valueToSend = messagingFee.nativeFee;
  const tokenAddress = await oft.token();
  if (tokenAddress === ethers.constants.AddressZero) {
    valueToSend = valueToSend.add(sendParam.amountLD);
  }
  console.log(`valueToSend: ${ethers.utils.formatUnits(valueToSend)} ETH`);
  return {
    valueToSend,
    sendParam,
    messagingFee,
    oft,
  };
}

// TOKEN=USDC npx hardhat run --network sepolia scripts/multichain/bridgeInCrossChain.ts
async function main() {
  const [wallet] = await hre.ethers.getSigners();
  const account = wallet.address;

  let amount: BigNumber;
  let valueToSend;
  let sendParam;
  let messagingFee;
  let oft;
  const composedMsg = await getComposedMsg({ account });

  if (process.env.TOKEN === "ETH") {
    amount = expandDecimals(Number(process.env.AMOUNT) || 20, 16); // 0.2 ETH
    ({ valueToSend, sendParam, messagingFee, oft } = await prepareSend(
      amount,
      composedMsg,
      STARGATE_POOL_NATIVE_SEPOLIA,
      6
    ));
    const { wntAddress } = await getDeployments();
    await logMultichainBalance(account, "WNT", wntAddress);
  } else if (process.env.TOKEN === "USDC") {
    amount = expandDecimals(Number(process.env.AMOUNT) || 50, 6); // 50 USDC
    ({ valueToSend, sendParam, messagingFee, oft } = await prepareSend(
      amount,
      composedMsg,
      STARGATE_POOL_USDC_SEPOLIA,
      6
    ));
    await logMultichainBalance(account, "USDC", STARGATE_POOL_USDC_SEPOLIA, 6);
  } else if (process.env.TOKEN === "GM") {
    amount = expandDecimals(Number(process.env.AMOUNT) || 3, 18); // 3 GM
    ({ valueToSend, sendParam, messagingFee, oft } = await prepareSend(amount, composedMsg, GM_OFT, 18));
    await logMultichainBalance(account, "GM", ETH_USD_MARKET_TOKEN);
  } else if (process.env.TOKEN === "GLV") {
    amount = expandDecimals(Number(process.env.AMOUNT) || 1, 18); // 1 GLV
    ({ valueToSend, sendParam, messagingFee, oft } = await prepareSend(amount, composedMsg, GLV_OFT, 18));
    await logMultichainBalance(account, "GLV", ETH_USD_GLV_ADDRESS);
  } else {
    throw new Error("⚠️ Unsupported TOKEN type. Use 'USDC', 'GM', or 'GLV'.");
  }

  const token: ERC20 = await ethers.getContractAt("ERC20", await oft.token());
  if (process.env.TOKEN === "ETH") {
    await logEthBalance(account, "before");
  } else {
    await checkBalance({ account, token, amount });
    await checkAllowance({ account, token, spender: oft.address, amount });
    await logTokenBalance(account, token, "before");
  }

  const { gasPrice, gasLimit } = await getIncreasedValues({
    sendParam,
    messagingFee,
    account,
    valueToSend,
    stargatePool: oft,
  });

  const tx = await oft.send(sendParam, messagingFee, account /* refundAddress */, {
    value: valueToSend,
    gasLimit,
    gasPrice,
  });

  console.log("Bridge in tx:", tx.hash);
  await tx.wait();
  console.log("Tx receipt received");

  if (process.env.TOKEN === "ETH") {
    await logEthBalance(account, "after");
  } else {
    await logTokenBalance(account, token, "after");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
