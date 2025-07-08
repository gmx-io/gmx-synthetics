import { BigNumber } from "ethers";

const { ethers } = hre;

export async function getIncreasedValues({
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

export async function checkBalance({ account, token, amount }) {
  console.log(`Checking balance for account: ${account} and ${process.env.TOKEN} token: ${token.address}`);
  const balance = await token.balanceOf(account);
  if (balance.lt(amount)) {
    throw new Error(`Insufficient balance. Need ${amount} but have ${balance}`);
  }
}

export async function checkAllowance({ account, token, spender, amount }) {
  console.log(`Checking allowance for account: ${account} on spender: ${spender}`);
  const allowance = await token.allowance(account, spender);
  if (allowance.lt(amount)) {
    await (await token.approve(spender, amount)).wait();
    console.log(`Allowance is now: ${await token.allowance(account, spender)}`);
  }
}
