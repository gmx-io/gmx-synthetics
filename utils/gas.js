async function printGasUsage(provider, tx, label) {
  const { gasUsed } = await provider.getTransactionReceipt(tx.hash);
  console.info(label, gasUsed.toString());
}

module.exports = {
  printGasUsage,
};
