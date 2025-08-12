const token = process.env.TOKEN;

async function main() {
  const claimHandler = await hre.ethers.getContract("ClaimHandler");
  const amount = await claimHandler.getTotalClaimableAmount(token);
  console.log("total claimable amount %s", amount);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
