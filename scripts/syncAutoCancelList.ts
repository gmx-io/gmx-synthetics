import hre from "hardhat";

async function main() {
  const autoCancelSyncer = await hre.ethers.getContract("AutoCancelSyncer");
  const tx = await autoCancelSyncer.syncAutoCancelOrderListForAccount(process.env.ACCOUNT, 0, 10);
  console.log(`txn sent: ${tx.hash}`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
