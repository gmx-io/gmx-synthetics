import hre from "hardhat";

import { fetchSignedPrices } from "../utils/prices";

export async function getSignedFundingOracleParams(market) {
  if (market.indexToken === hre.ethers.constants.AddressZero) {
    throw new Error("Funding configuration is not supported for a swap-only market");
  }

  const chainlinkDataStreamProvider = await hre.ethers.getContract("ChainlinkDataStreamProvider");
  const signedPrices = await fetchSignedPrices();
  const tokens = [...new Set([market.indexToken, market.longToken, market.shortToken])];

  const providers: string[] = [];
  const data: string[] = [];

  for (const token of tokens) {
    const signedPrice = signedPrices[token.toLowerCase()];
    if (!signedPrice?.blob) {
      throw new Error(`Signed price not found for token ${token}`);
    }

    providers.push(chainlinkDataStreamProvider.address);
    data.push(signedPrice.blob);
  }

  return { tokens, providers, data };
}
