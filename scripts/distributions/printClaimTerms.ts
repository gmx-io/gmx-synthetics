import * as keys from "../../utils/keys";

const distributionId = process.env.DISTRIBUTION_ID;

async function main() {
  const dataStore = await hre.ethers.getContract("DataStore");
  const key = keys.claimTermsKey(distributionId);
  const terms = await dataStore.getString(key);
  console.log("terms '%s'", terms);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
