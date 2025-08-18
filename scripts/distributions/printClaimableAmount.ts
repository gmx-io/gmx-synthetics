const distributionId = process.env.DISTRIBUTION_ID;
const token = process.env.TOKEN;
const account = process.env.ACCOUNT;

async function main() {
  const claimHandler = await hre.ethers.getContract("ClaimHandler");
  const amount = await claimHandler.getClaimableAmount(account, token, [distributionId]);
  console.log("claimable amount %s", amount);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
