async function main() {
  const str = process.env.STR;
  console.log(ethers.utils.id(str));
  console.log(ethers.BigNumber.from(ethers.utils.id(str)).toString());
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
