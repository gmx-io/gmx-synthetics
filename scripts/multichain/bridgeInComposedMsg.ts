import hre from "hardhat";
import { BigNumber } from "ethers";
import { JsonRpcProvider } from "@ethersproject/providers";
import { ERC20, IStargate } from "../../typechain-types";

import { Options } from "@layerzerolabs/lz-v2-utilities";

import { expandDecimals } from "../../utils/math";
import { encodeSetTraderReferralCodeMessage } from "../../utils/multichain";

const { ethers } = hre;

// Sepolia
const STARGATE_POOL_USDC_SEPOLIA = "0x4985b8fcEA3659FD801a5b857dA1D00e985863F0";
const STARGATE_USDC_SEPOLIA = "0x2F6F07CDcf3588944Bf4C42aC74ff24bF56e7590";

// ArbitrumSepolia
const DST_CHAIN_ID = 421614;
const DST_EID = 40231;
const layerZeroProviderJson = import("../../deployments/arbitrumSepolia/LayerZeroProvider.json");
const multichainOrderRouterJson = import("../../deployments/arbitrumSepolia/MultichainOrderRouter.json");

async function prepareSend(
  amount: number | string | BigNumber,
  composeMsg: string,
  stargatePoolAddress: string,
  decimals: number,
  extraGas = 500000,
  slippageBps = 100 // Default 1% slippage tolerance
) {
  const stargatePool: IStargate = await ethers.getContractAt("IStargate", stargatePoolAddress);
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

async function checkAllowance({ account, token, spender, amount }) {
  const allowance = await token.allowance(account, spender);
  if (allowance.lt(amount)) {
    await (await token.approve(spender, amount)).wait();
    console.log(`Allowance is now: ${await token.allowance(account, spender)}`);
  }
}

async function retrieveFromDestination(account: string, relayRouterJson: any): Promise<any> {
  const provider = new JsonRpcProvider("https://sepolia-rollup.arbitrum.io/rpc");

  // contracts with destination provider
  const relayRouter = new ethers.Contract(
    (await relayRouterJson).address,
    ["function userNonces(address account) view returns (uint256)"],
    provider
  );

  const userNonce = await relayRouter.userNonces(account);

  return {
    relayRouter,
    userNonce: userNonce.toNumber(),
  };
}

enum ActionType {
  None,
  Deposit,
  GlvDeposit,
  BridgeOut,
  SetTraderReferralCode,
}

async function getComposedMsg({
  account,
  actionType,
  wntAmount,
  usdcAmount,
}: {
  account: string;
  actionType: ActionType;
  wntAmount: BigNumber;
  usdcAmount: BigNumber;
}): Promise<string> {
  if (actionType === ActionType.None) {
    return ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [account, "0x"]);
  }

  const srcChainId = await hre.ethers.provider.getNetwork().then((network) => network.chainId);

  if (actionType === ActionType.SetTraderReferralCode) {
    const referralCode = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(`ReferralCode-${Date.now()}`));
    const { relayRouter, userNonce } = await retrieveFromDestination(account, multichainOrderRouterJson);

    const setTraderReferralCodeParams = {
      sender: await hre.ethers.getSigner(account),
      signer: await hre.ethers.getSigner(account),
      feeParams: {
        feeToken: ethers.constants.AddressZero,
        feeAmount: 0,
        feeSwapPath: [],
      },
      account,
      referralCode,
      deadline: 9999999999,
      srcChainId, // 0 means non-multichain action
      desChainId: DST_CHAIN_ID, // for non-multichain actions, desChainId is the same as chainId
      relayRouter,
      chainId: srcChainId,
      gelatoRelayFeeToken: ethers.constants.AddressZero,
      gelatoRelayFeeAmount: 0,
      userNonce, // the actual user nonce from the destination chain
    };

    const message = await encodeSetTraderReferralCodeMessage(setTraderReferralCodeParams, referralCode, account);

    return message;
  }
}

// npx hardhat run --network sepolia scripts/multichain/bridgeInComposedMsg.ts
async function main() {
  const [wallet] = await hre.ethers.getSigners();
  const account = wallet.address;

  // Bridge USDC (ETH bridging fails due to Stargate insufficient funds for path)
  const usdc: ERC20 = await ethers.getContractAt("ERC20", STARGATE_USDC_SEPOLIA);
  const usdcBalance = await usdc.balanceOf(account);
  const usdcAmount = expandDecimals(1, 6); // to send a composed msg, we need to send the min stargate amount for bridging (e.g. 0.1 USDC)
  if (usdcBalance.lt(usdcAmount)) {
    throw new Error(
      `Insufficient USDC balance: need ${ethers.utils.formatUnits(usdcAmount, 6)} but have ${ethers.utils.formatUnits(
        usdcBalance,
        6
      )}`
    );
  }
  await checkAllowance({ account, token: usdc, spender: STARGATE_POOL_USDC_SEPOLIA, amount: usdcAmount });

  const composedMsg = await getComposedMsg({
    account,
    actionType: ActionType.SetTraderReferralCode,
    wntAmount: BigNumber.from(0),
    usdcAmount,
  });

  const {
    valueToSend,
    sendParam,
    messagingFee,
    stargatePool: stargatePoolUsdc,
  } = await prepareSend(usdcAmount, composedMsg, STARGATE_POOL_USDC_SEPOLIA, 6);

  const { gasPrice, gasLimit } = await getIncreasedValues({
    sendParam,
    messagingFee,
    account,
    valueToSend,
    stargatePool: stargatePoolUsdc,
  });

  const tx = await stargatePoolUsdc.sendToken(sendParam, messagingFee, account /* refundAddress */, {
    value: valueToSend,
    gasLimit,
    gasPrice,
  });

  console.log("Composed message sent (with usdc)", tx.hash);
  await tx.wait();
  console.log("Composed message receipt received");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
