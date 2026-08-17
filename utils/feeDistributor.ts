import { hashString } from "./hash";
import * as keys from "./keys";

export const gmxKey = hashString("GMX");
export const rewardTrackerKey = hashString("REWARD_TRACKER");
export const dataStoreKey = hashString("DATASTORE");
export const treasuryKey = hashString("TREASURY");
export const layerzeroOftKey = hashString("LAYERZERO_OFT");
export const chainlinkKey = hashString("CHAINLINK");
export const feeDistributorVaultKey = hashString("FEE_DISTRIBUTOR_VAULT");
export const feeWithdrawerKey = hashString("FEE_WITHDRAWER");

const SECONDS_IN_DAY = 86400;
const TARGET_OFFSET_SECONDS = 60;

function getNextDistributionTimestampFixed(currentTimestamp: number, distributionDay: number): number {
  // Calculate the day number (number of whole days since epoch)
  const currentDayNumber = Math.floor(currentTimestamp / SECONDS_IN_DAY);
  // Get current day of week (0 = Sunday, 1 = Monday, etc.)
  const currentDayOfWeek = (currentDayNumber + 4) % 7;

  // Determine days to add: if today is the target day, schedule for next week.
  let daysUntilNext = distributionDay - currentDayOfWeek;
  if (daysUntilNext <= 0) {
    daysUntilNext += 7;
  }

  // Next day number (for the target day) equals current day number plus the calculated offset.
  const nextDayNumber = currentDayNumber + daysUntilNext;

  // Compute the next distribution timestamp: midnight of the next occurrence + offset.
  return nextDayNumber * SECONDS_IN_DAY + TARGET_OFFSET_SECONDS;
}

export async function moveToNextDistributionDay(distributionDay: number) {
  const block = await hre.ethers.provider.getBlock("latest");
  const nextTimestamp = getNextDistributionTimestampFixed(block.timestamp, distributionDay);

  await hre.ethers.provider.send("evm_setNextBlockTimestamp", [nextTimestamp]);
  await hre.ethers.provider.send("evm_mine");
}

// moves to a timestamp shortly before the next distribution-day midnight, i.e. near the end of
// the currently open distribution week
export async function moveToEndOfCurrentDistributionWeek(distributionDay: number, secondsBeforeBoundary = 90) {
  const block = await hre.ethers.provider.getBlock("latest");
  const boundary = getNextDistributionTimestampFixed(block.timestamp, distributionDay) - TARGET_OFFSET_SECONDS;

  await hre.ethers.provider.send("evm_setNextBlockTimestamp", [boundary - secondsBeforeBoundary]);
  await hre.ethers.provider.send("evm_mine");
}

// mirrors FeeDistributor._getEpochId: the timestamp of the start of the current distribution week
export function getEpochId(timestamp: number, distributionDay: number): number {
  const dayOfWeek = (Math.floor(timestamp / SECONDS_IN_DAY) + 4) % 7;
  const daysSinceDistributionDay = (((dayOfWeek + 7 - distributionDay) % 7) + 7) % 7;
  const midnightToday = timestamp - (timestamp % SECONDS_IN_DAY);
  return midnightToday - daysSinceDistributionDay * SECONDS_IN_DAY;
}

export async function getCurrentEpochId(distributionDay: number): Promise<number> {
  const block = await hre.ethers.provider.getBlock("latest");
  return getEpochId(block.timestamp, distributionDay);
}

// writes the committed snapshot tuple for a simulated remote chain to its stand-in DataStore,
// deriving the same values the remote chain's commitSnapshot would commit
export async function commitRemoteSnapshot({
  mock,
  gmxToken,
  vaultAddress,
  chainId,
  distributionDay,
  epochId,
}: {
  mock: any;
  gmxToken: any;
  vaultAddress: string;
  chainId: number;
  distributionDay: number;
  epochId?: number;
}) {
  if (epochId === undefined) {
    epochId = await getCurrentEpochId(distributionDay);
  }
  const withdrawable = await mock.withdrawableAmount(gmxToken.address);
  const vaultBalance = await gmxToken.balanceOf(vaultAddress);
  const staked = await mock.totalSupply();

  await mock.setUint(keys.feeDistributorSnapshotEpochKey(chainId), epochId);
  await mock.setUint(keys.feeDistributorSnapshotFeeAmountGmxKey(chainId), withdrawable.add(vaultBalance));
  await mock.setUint(keys.feeDistributorSnapshotStakedGmxKey(chainId), staked);
}
