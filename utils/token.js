const { contractAt } = require("./deploy");

async function getBalanceOf(tokenAddress, account) {
  const token = await contractAt("MarketToken", tokenAddress);
  return await token.balanceOf(account);
}

async function getSupplyOf(tokenAddress) {
  const token = await contractAt("MarketToken", tokenAddress);
  return await token.totalSupply();
}

module.exports = {
  getBalanceOf,
  getSupplyOf,
};
