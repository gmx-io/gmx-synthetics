import { hashString } from "./hash";

export const gmxKey = hashString("GMX");
export const extendedGmxTrackerKey = hashString("EXTENDED_GMX_TRACKER");
export const dataStoreKey = hashString("DATASTORE");
export const synapseRouterKey = hashString("SYNAPSE_ROUTER");

// Constants
const SECONDS_IN_DAY = 86400;
const TARGET_OFFSET_SECONDS = 60; // 60 seconds after midnight (12:01 AM)

/**
 * Calculates the timestamp for the next occurrence of a given distribution day,
 * with the time set to midnight plus a fixed offset (e.g. 60 seconds for 12:01 AM).
 *
 * @param currentTimestamp - the current timestamp (seconds)
 * @param distributionDay - target day as an integer (0 = Sunday, 1 = Monday, …, 6 = Saturday)
 * @returns The timestamp for the next occurrence of distributionDay at ~12:01 AM.
 */
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

/**
 * Moves the blockchain time to the next occurrence of the target distribution day,
 * with the time set to ~12:01 AM.
 *
 * @param distributionDay - target day (0 = Sunday, 1 = Monday, …, 6 = Saturday)
 */
export async function moveToNextDistributionDay(distributionDay: number) {
  const block = await ethers.provider.getBlock("latest");
  const currentTimestamp = block.timestamp;
  const nextTimestamp = getNextDistributionTimestampFixed(currentTimestamp, distributionDay);

  await ethers.provider.send("evm_setNextBlockTimestamp", [nextTimestamp]);
  await ethers.provider.send("evm_mine");
}
