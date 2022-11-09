export async function printGasUsage(provider, txn, label) {
  const { gasUsed } = await provider.getTransactionReceipt(txn.hash);
  console.info(label, gasUsed.toString());
}

export async function logGasUsage({ tx, label }) {
  const { provider } = ethers;
  const result = await tx;
  if (label) {
    const { gasUsed } = await provider.getTransactionReceipt(result.hash);
    console.info(label, gasUsed.toString());
  }
}
