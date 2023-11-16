import { keccakString } from "./hash";

export const TIMELOCK_ADMIN_ROLE = keccakString("TIMELOCK_ADMIN_ROLE");
export const PROPOSER_ROLE = keccakString("PROPOSER_ROLE");
export const EXECUTOR_ROLE = keccakString("EXECUTOR_ROLE");
export const CANCELLER_ROLE = keccakString("CANCELLER_ROLE");

export const Support = {
  Against: 0,
  For: 1,
  Abstain: 2,
};

export const State = {
  Pending: 0,
  Active: 1,
  Canceled: 2,
  Defeated: 3,
  Succeeded: 4,
  Queued: 5,
  Expired: 6,
  Executed: 7,
};
