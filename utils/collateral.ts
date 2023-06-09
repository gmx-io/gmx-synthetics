export async function getClaimableCollateralTimeKey() {
  const block = await ethers.provider.getBlock();
  return parseInt(block.timestamp / (60 * 60));
}
