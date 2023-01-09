import hre from "hardhat";

async function main() {
  const { gmx, deployments } = hre;
  for (const [symbol, tokenConfig] of Object.entries(await gmx.getTokens())) {
    let address = tokenConfig.address;
    if (!address) {
      const { address: _address } = await deployments.get(symbol);
      address = _address;
    }
    console.log(
      "%s %s, decimals: %s%s",
      symbol.padEnd(5),
      address,
      String(tokenConfig.decimals).padEnd(2),
      tokenConfig.synthetic ? ", synthetic" : ""
    );
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
