import hre from "hardhat";

async function main() {
  const config = await hre.ethers.getContract("Config");
  const market = process.env.MARKET;
  const token = process.env.TOKEN;
  const timeKey = process.env.TIME_KEY;
  const factor = process.env.FACTOR;

  const tx = await config.setClaimableCollateralFactorForTime(market, token, timeKey, factor);
  console.log(`tx sent: ${tx.hash}`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
