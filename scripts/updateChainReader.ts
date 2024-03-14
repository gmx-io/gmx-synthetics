import hre from "hardhat";

async function main() {
  const chainReader = await hre.ethers.getContract("ChainReader");
  console.log("chainReader", chainReader.address);
  console.log("provider", hre.ethers.provider.connection);
  const latestBlock = await hre.ethers.provider.getBlockNumber();

  console.log("estimating getBlockHashWithDelayAndLatestBlockNumber(10)");
  await chainReader.estimateGas.getBlockHashWithDelayAndLatestBlockNumber(10);

  console.log("estimating updateLatestBlockHashWithDelay()");
  console.log("encoded", chainReader.interface.encodeFunctionData("updateLatestBlockHashWithDelay", []));
  await chainReader.estimateGas.updateLatestBlockHashWithDelay();

  const blockNumber = latestBlock - 10;
  console.log(`estimating gas for block ${blockNumber} latest block: ${latestBlock}`);
  const gas = await chainReader.estimateGas.updateLatestBlockHash(blockNumber);
  console.log("gas", gas.toString());
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
