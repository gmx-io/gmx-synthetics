async function main() {
  console.log(ethers.BigNumber.from(ethers.utils.id("GLP_DISTRIBUTION")).toString());
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
