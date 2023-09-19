import hre from "hardhat";

export async function validateTokens() {
  const tokens = await hre.gmx.getTokens();
  console.log(`validating ${Object.entries(tokens).length} tokens ...`);

  for (const [tokenSymbol, token] of Object.entries(tokens)) {
    if (!token.decimals) {
      throw new Error(`token ${tokenSymbol} has no decimals`);
    }

    if (token.synthetic) {
      console.log(`skipping ${tokenSymbol} as it is synthetic`);
      continue;
    }

    console.log(`checking ${tokenSymbol}`);

    const tokenContract = await ethers.getContractAt("MarketToken", token.address);

    const decimals = await tokenContract.decimals();

    if (decimals !== token.decimals) {
      throw new Error(
        `invalid token decimals for ${tokenSymbol}, configuration: ${token.decimals}, fetched: ${decimals}`
      );
    }
  }

  console.log(`... validated ${Object.entries(tokens).length} tokens`);
}
