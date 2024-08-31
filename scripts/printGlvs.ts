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
  const glvInfoList = [...(await glvReader.getGlvInfoList(dataStore.address, 0, 100))];

  for (const glvInfo of glvInfoList) {
    const longTokenSymbol = addressToSymbol[glvInfo.glv.longToken];
    const shortTokenSymbol = addressToSymbol[glvInfo.glv.shortToken];
    console.log("%s long: %s short: %s", glvInfo.glv.glvToken, longTokenSymbol?.padEnd(5), shortTokenSymbol?.padEnd(5));
    for (const market of glvInfo.markets) {
      console.log("\t%s", market);
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
