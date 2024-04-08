import hre from "hardhat";

async function main() {
  const data = process.env.DATA;

  if (!data) {
    throw new Error("DATA env var is required");
  }

  const artifact = await hre.deployments.getArtifact("ExchangeRouter");
  const exchangeRouterInterface = new hre.ethers.utils.Interface(artifact.abi);

  const decoded = exchangeRouterInterface.parseTransaction({ data });
  console.log("decoded", decoded);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex.toString());
    process.exit(1);
  });
