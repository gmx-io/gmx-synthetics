import { TransactionReceipt } from "@ethersproject/providers";
import { expandDecimals } from "./math";

export async function printGasUsage(provider, txn, label) {
  const { gasUsed } = await provider.getTransactionReceipt(txn.hash);
  console.info(label, gasUsed.toString());
}

export async function logGasUsage({ tx, label }): Promise<TransactionReceipt> {
  const { provider } = hre.ethers;
  const result = await tx;

  const txReceipt = await provider.getTransactionReceipt(result.hash);

  if (label) {
    console.info(label, txReceipt.gasUsed.toString());
  }

  return txReceipt;
}

// Gas cost tolerance buffers in wei
// These represent acceptable variation in gas refunds for different operation types
// Increase these values if contract changes cause gas-related test failures
export const GAS_BUFFER = {
  DEPOSIT: expandDecimals(5, 12), //  5k gwei = 0.000005 ETH
  GLV_DEPOSIT: expandDecimals(5, 12), //  5k gwei = 0.000005 ETH
  WITHDRAWAL: expandDecimals(5, 12), //  5k gwei = 0.000005 ETH
  GLV_WITHDRAWAL: expandDecimals(5, 12), //  5k gwei = 0.000005 ETH
  ORDER: expandDecimals(20, 12), // 20k gwei = 0.00002 ETH
  CUMULATIVE_ACTIONS: expandDecimals(50, 12), // 50k gwei = 0.00005 ETH e.g. deposit + glvDeposit + withdrawal + glvWithdrawal
};
