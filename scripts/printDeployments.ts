import hre from "hardhat";

async function main() {
  const { deployments } = hre;
  const allDeployments = await deployments.all();
  const chainId = await hre.ethers.provider.getNetwork().then((network) => network.chainId);
  for (const [contractName, { address }] of Object.entries(allDeployments)) {
    if (process.env.TABLE_FORMAT) {
      console.log(`${chainId},${address},v2.2`);
    } else {
      console.log(contractName, address);
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
