const { keccak256, toUtf8Bytes } = ethers.utils;

export const TIMELOCK_ADMIN_ROLE = keccak256(toUtf8Bytes("TIMELOCK_ADMIN_ROLE"));
export const PROPOSER_ROLE = keccak256(toUtf8Bytes("PROPOSER_ROLE"));
export const EXECUTOR_ROLE = keccak256(toUtf8Bytes("EXECUTOR_ROLE"));
export const CANCELLER_ROLE = keccak256(toUtf8Bytes("CANCELLER_ROLE"));
