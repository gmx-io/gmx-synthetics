import { time } from "@nomicfoundation/hardhat-network-helpers";
import { mine } from "@nomicfoundation/hardhat-network-helpers";

export async function increaseTime(refTime, value) {
  await mine(1);
  const currentTime = (await ethers.provider.getBlock()).timestamp;
  await time.increase(value - (currentTime - refTime));
}
