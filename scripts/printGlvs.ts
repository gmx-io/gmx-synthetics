import hre from "hardhat";

async function main() {
  const tokens = await hre.gmx.getTokens();
  const addressToSymbol: { [address: string]: string } = {};
  for (const [tokenSymbol, tokenConfig] of Object.entries(tokens)) {
    let address = tokenConfig.address;
    if (!address) {
      address = (await hre.ethers.getContract(tokenSymbol)).address;
    }
    addressToSymbol[address] = tokenSymbol;
  }

  const glvReader = await hre.ethers.getContract("GlvReader");
  const dataStore = await hre.ethers.getContract("DataStore");
  console.log("reading data from DataStore %s Reader %s", dataStore.address, glvReader.address);
  const glvs = [...(await glvReader.getGlvs(dataStore.address, 0, 100))];

  for (const glv of glvs) {
    const longTokenSymbol = addressToSymbol[glv.longToken];
    const shortTokenSymbol = addressToSymbol[glv.shortToken];
    console.log("%s long: %s short: %s", glv.glvToken, longTokenSymbol?.padEnd(5), shortTokenSymbol?.padEnd(5));
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
