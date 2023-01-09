import hre from "hardhat";

async function main() {
  const reader = await hre.ethers.getContract("Reader");
  const dataStore = await hre.ethers.getContract("DataStore");
  const marketStore = await hre.ethers.getContract("MarketStore");
  const marketKey = "0xDBC9D0a889CDa5eAFAA086feA8d6104750BA7b11";
  const prices = {
    longTokenPrice: {
      min: "11803400000000",
      max: "11803400000000",
    },
    shortTokenPrice: {
      min: "1000000000000000000000000",
      max: "1000000000000000000000000",
    },
    indexTokenPrice: {
      min: "11803400000000",
      max: "11803400000000",
    },
  };

  const marketInfo = await reader.getMarketInfo(dataStore.address, marketStore.address, prices, marketKey);
  console.log("marketInfo", marketInfo);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
