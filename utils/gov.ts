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

// ProtocolGovernor keeps using the timelock it was constructed with; it can only switch
// through a successful updateTimelock governance proposal, so the deployment artifact
// must always record the timelock the governor actually uses.
export async function validateGovTimelockArtifact({ deployments, ethers }) {
  const protocolGovernorDeployment = await deployments.getOrNull("ProtocolGovernor");
  const govTimelockControllerDeployment = await deployments.getOrNull("GovTimelockController");

  if (!protocolGovernorDeployment || !govTimelockControllerDeployment) {
    return;
  }

  const protocolGovernor = await ethers.getContractAt("ProtocolGovernor", protocolGovernorDeployment.address);
  const protocolGovernorTimelock = await protocolGovernor.timelock();

  if (govTimelockControllerDeployment.address.toLowerCase() !== protocolGovernorTimelock.toLowerCase()) {
    throw new Error(
      `GovTimelockController deployment artifact (${govTimelockControllerDeployment.address}) does not match ` +
        `ProtocolGovernor.timelock() (${protocolGovernorTimelock}); the artifact must record the timelock ` +
        `the governor actually uses`
    );
  }
}
