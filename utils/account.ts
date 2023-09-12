export function createAccount() {
  const account = ethers.Wallet.createRandom();
  return account.connect(ethers.provider);
}
