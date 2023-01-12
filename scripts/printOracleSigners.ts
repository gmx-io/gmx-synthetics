import hre from "hardhat";

async function main() {
  const oracleStore = await hre.ethers.getContract("OracleStore");
  const signerCount = await oracleStore.getSignerCount();
  const signers = await oracleStore.getSigners(0, signerCount);
  for (const [index, signer] of signers.entries()) {
    console.log("Signer", index, signer);
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
