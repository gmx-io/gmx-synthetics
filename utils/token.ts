import { contractAt } from "./deploy";
import { hashData } from "./hash";

export async function getBalanceOf(tokenAddress, account) {
  const token = await contractAt("MarketToken", tokenAddress);
  return await token.balanceOf(account);
}

export async function getSupplyOf(tokenAddress) {
  const token = await contractAt("MarketToken", tokenAddress);
  return await token.totalSupply();
}

export function getSyntheticTokenAddress(tokenSymbol: string) {
  return "0x" + hashData(["string"], [tokenSymbol]).substring(26);
}
