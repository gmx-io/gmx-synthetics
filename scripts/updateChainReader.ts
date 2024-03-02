import hre from "hardhat";

async function main() {
  const chainReader = await hre.ethers.getContract("ChainReader");
  const latestBlock = await hre.ethers.provider.getBlockNumber();
  const blockNumber = latestBlock - 1;
  console.log(`estimating gas for ${blockNumber}`);
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
