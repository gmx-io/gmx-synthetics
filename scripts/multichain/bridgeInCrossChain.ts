import hre from "hardhat";
import { BigNumber } from "ethers";
import { ERC20, IOFT } from "../../typechain-types";

import { Options } from "@layerzerolabs/lz-v2-utilities";

import { expandDecimals } from "../../utils/math";
import { checkAllowance, checkBalance, getDeployments, getIncreasedValues } from "./utils";

const { ethers } = hre;

// IOFT vs. IStargate
// IOFT is being used since it's more general, but IStargate has identical
// interface, tho only difference being the additional `sendToken` method

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
  const extraOptions = Options.newOptions().addExecutorComposeOption(0, gasLimit, msgValue);

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

// TOKEN=<USDC/GM/GLV> AMOUNT=<number> npx hardhat run --network sepolia scripts/multichain/bridgeInCrossChain.ts
async function main() {
  const [wallet] = await hre.ethers.getSigners();
  const account = wallet.address;

  let amount: BigNumber;
  let valueToSend;
  let sendParam;
  let messagingFee;
  let oft;
  const composedMsg = await getComposedMsg({ account });

  if (process.env.TOKEN === "USDC") {
    amount = expandDecimals(Number(process.env.AMOUNT) || 50, 6); // 50 USDC
    ({ valueToSend, sendParam, messagingFee, oft } = await prepareSend(
      amount,
      composedMsg,
      STARGATE_POOL_USDC_SEPOLIA,
      6
    ));
  } else if (process.env.TOKEN === "GM") {
    amount = expandDecimals(Number(process.env.AMOUNT) || 3, 18); // 3 GM
    ({ valueToSend, sendParam, messagingFee, oft } = await prepareSend(amount, composedMsg, GM_OFT, 18));
  } else if (process.env.TOKEN === "GLV") {
    amount = expandDecimals(Number(process.env.AMOUNT) || 1, 18); // 1 GLV
    ({ valueToSend, sendParam, messagingFee, oft } = await prepareSend(amount, composedMsg, GLV_OFT, 18)); // todo
  } else {
    throw new Error("⚠️ Unsupported TOKEN type. Use 'USDC', 'GM', or 'GLV'.");
  }

  const token: ERC20 = await ethers.getContractAt("ERC20", await oft.token());
  await checkBalance({ account, token, amount });
  await checkAllowance({ account, token, spender: oft.address, amount });

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
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
