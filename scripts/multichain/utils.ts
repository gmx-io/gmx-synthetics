import { JsonRpcProvider } from "@ethersproject/providers";
import { BigNumber } from "ethers";
import {
  DepositVault,
  ERC20,
  GlvFactory,
  GlvVault,
  LayerZeroProvider,
  MultichainGlvRouter,
  MultichainGmRouter,
  MultichainOrderRouter,
  MultichainTransferRouter,
  MultichainVault,
  RoleStore,
  WithdrawalVault,
} from "../../typechain-types";
import * as keys from "../../utils/keys";

const { ethers } = hre;

const dataStoreJson = import("../../deployments/arbitrumSepolia/DataStore.json");
const roleStoreJson = import("../../deployments/arbitrumSepolia/RoleStore.json");
const glvFactoryJson = import("../../deployments/arbitrumSepolia/GlvFactory.json");
const depositVaultJson = import("../../deployments/arbitrumSepolia/DepositVault.json");
const withdrawalVaultJson = import("../../deployments/arbitrumSepolia/WithdrawalVault.json");
const glvVaultJson = import("../../deployments/arbitrumSepolia/GlvVault.json");
const layerZeroProviderJson = import("../../deployments/arbitrumSepolia/LayerZeroProvider.json");
const multichainVaultJson = import("../../deployments/arbitrumSepolia/MultichainVault.json");
const multichainGmRouterJson = import("../../deployments/arbitrumSepolia/MultichainGmRouter.json");
const multichainGlvRouterJson = import("../../deployments/arbitrumSepolia/MultichainGlvRouter.json");
const multichainOrderRouterJson = import("../../deployments/arbitrumSepolia/MultichainOrderRouter.json");
const multichainTransferRouterJson = import("../../deployments/arbitrumSepolia/MultichainTransferRouter.json");

export async function getDeployments(): Promise<any> {
  const provider = new JsonRpcProvider("https://sepolia-rollup.arbitrum.io/rpc");

  // contracts with arbitrum sepolia provider
  const dataStore = new ethers.Contract(
    (await dataStoreJson).address,
    ["function getAddress(bytes32 key) view returns (address)", "function getUint(bytes32 key) view returns (uint256)"],
    provider
  );
  const wntAddress = await dataStore.getAddress(keys.WNT);

  // contracts with provider from calling chain
  const roleStore: RoleStore = await ethers.getContractAt("RoleStore", (await roleStoreJson).address);
  const glvFactory: GlvFactory = await ethers.getContractAt("GlvFactory", (await glvFactoryJson).address);
  const depositVault: DepositVault = await ethers.getContractAt("DepositVault", (await depositVaultJson).address);
  const withdrawalVault: WithdrawalVault = await ethers.getContractAt(
    "WithdrawalVault",
    (
      await withdrawalVaultJson
    ).address
  );
  const glvVault: GlvVault = await ethers.getContractAt("GlvVault", (await glvVaultJson).address);
  const layerZeroProvider: LayerZeroProvider = await ethers.getContractAt(
    "LayerZeroProvider",
    (
      await layerZeroProviderJson
    ).address
  );
  const multichainVault: MultichainVault = await ethers.getContractAt(
    "MultichainVault",
    (
      await multichainVaultJson
    ).address
  );
  const multichainGmRouter: MultichainGmRouter = await ethers.getContractAt(
    "MultichainGmRouter",
    (
      await multichainGmRouterJson
    ).address
  );
  const multichainGlvRouter: MultichainGlvRouter = await ethers.getContractAt(
    "MultichainGlvRouter",
    (
      await multichainGlvRouterJson
    ).address
  );
  const multichainOrderRouter: MultichainOrderRouter = await ethers.getContractAt(
    "MultichainOrderRouter",
    (
      await multichainOrderRouterJson
    ).address
  );
  const multichainTransferRouter: MultichainTransferRouter = await ethers.getContractAt(
    "MultichainTransferRouter",
    (
      await multichainTransferRouterJson
    ).address
  );

  return {
    dataStore,
    wntAddress,
    roleStore,
    glvFactory,
    depositVault,
    withdrawalVault,
    glvVault,
    layerZeroProvider,
    multichainVault,
    multichainGmRouter,
    multichainGlvRouter,
    multichainOrderRouter,
    multichainTransferRouter,
  };
}

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
  const balance = await logEthBalance(account, "before transaction");

  // Estimate gas for transaction
  let gasLimit = await stargatePool.estimateGas
    .send(
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
  console.log(`Checking balance for account: ${account} and ${await token.symbol()} token: ${token.address}`);
  const balance = await token.balanceOf(account);
  if (balance.lt(amount)) {
    throw new Error(`Insufficient balance. Need ${amount} but have ${balance}`);
  }
}

export async function checkMultichainBalance({ account, token, amount }) {
  console.log(
    `Checking multichain balance for account: ${account} and ${await token.symbol()} token: ${token.address}`
  );
  const { dataStore } = await getDeployments();
  const balance = await dataStore.getUint(keys.multichainBalanceKey(account, token.address));
  if (balance.lt(amount)) {
    throw new Error(`Insufficient multichain balance. Need ${amount} but have ${balance}`);
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

export async function logEthBalance(account: string, at = "") {
  const balance = await ethers.provider.getBalance(account);
  console.log(`User's account ETH balance ${at}: ${ethers.utils.formatUnits(balance, 18)}`);
  return balance;
}

export async function logTokenBalance(account: string, token: ERC20, at = "") {
  const balance = await token.balanceOf(account);
  console.log(
    `User's account ${await token.symbol()} balance ${at}: ${ethers.utils.formatUnits(balance, await token.decimals())}`
  );
  return balance;
}

export async function logMultichainBalance(
  account: string,
  tokenSymbol: string,
  tokenAddress: string,
  tokenDecimals = 18
) {
  const { dataStore } = await getDeployments();
  const balance = await dataStore.getUint(keys.multichainBalanceKey(account, tokenAddress));
  console.log(`User's multichain ${tokenSymbol} balance: ${ethers.utils.formatUnits(balance, tokenDecimals)}`);
  return balance;
}
