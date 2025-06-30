import { hashString } from "./hash";

export const gmxKey = hashString("GMX");
export const extendedGmxTrackerKey = hashString("EXTENDED_GMX_TRACKER");
export const dataStoreKey = hashString("DATASTORE");
export const treasuryKey = hashString("TREASURY");
export const layerzeroOftKey = hashString("LAYERZERO_OFT");
export const feeGlpTrackerKey = hashString("FEE_GLP_TRACKER");
export const chainlinkKey = hashString("CHAINLINK");
export const esGmxVesterKey = hashString("ESGMX_VESTER");

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
  const block = await ethers.provider.getBlock("latest");
  const nextTimestamp = getNextDistributionTimestampFixed(block.timestamp, distributionDay);

  await ethers.provider.send("evm_setNextBlockTimestamp", [nextTimestamp]);
  await ethers.provider.send("evm_mine");
}
