import { expandDecimals } from "../utils/math";

async function main() {
  const collateralFactorManager = await hre.ethers.getContract("CollateralFactorManager");
  const tx = await collateralFactorManager.setMinCollateralFactorForLiquidation(
    "0x89EB78679921499632fF16B1be3ee48295cfCD91",
    expandDecimals(1, 30)
  );
  console.log("tx.hash", tx.hash);
  const receipt = await tx.wait();
  console.log("receipt", receipt);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
