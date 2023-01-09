import hre from "hardhat";

async function main() {
  const btc = await hre.ethers.getContract("WBTC");

  console.log("%s %s %s decimals", await btc.symbol(), btc.address, await btc.decimals());
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
