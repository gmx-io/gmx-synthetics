import hre from "hardhat";

async function main() {
  const depositStore = await hre.ethers.getContract("DepositStore");
  const depositCount = await depositStore.getDepositCount();
  const depositKeys = await depositStore.getDepositKeys(0, depositCount);
  for (const key of depositKeys) {
    const deposit = await depositStore.get(key);
    console.log("%s", key);
    for (const prop of Object.keys(deposit)) {
      if (!isNaN(Number(prop))) {
        continue;
      }
      console.log(" . %s: %s", prop, deposit[prop].toString());
    }
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
