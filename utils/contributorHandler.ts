export function daysInSeconds(days: number): number {
  const SECONDS_IN_DAY = 86400;
  return days * SECONDS_IN_DAY;
}

export async function increaseBlockTimestamp(increaseInSeconds: number) {
  const block = await ethers.provider.getBlock("latest");
  const nextTimestamp = block.timestamp + increaseInSeconds;

  await ethers.provider.send("evm_setNextBlockTimestamp", [nextTimestamp]);
  await ethers.provider.send("evm_mine");
}
