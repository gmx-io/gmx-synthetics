import { contractAt } from "./deploy";

export async function getBalanceOf(tokenAddress, account) {
  const token = await contractAt("MarketToken", tokenAddress);
  return await token.balanceOf(account);
}

export async function getSupplyOf(tokenAddress) {
  const token = await contractAt("MarketToken", tokenAddress);
  return await token.totalSupply();
}
