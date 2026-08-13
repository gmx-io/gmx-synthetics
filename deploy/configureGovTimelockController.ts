import { TIMELOCK_ADMIN_ROLE, PROPOSER_ROLE, EXECUTOR_ROLE, CANCELLER_ROLE } from "../utils/gov";

const func = async ({ getNamedAccounts }) => {
  const { deployer } = await getNamedAccounts();

  const govTimelockController = await ethers.getContract("GovTimelockController");
  const protocolGovernor = await ethers.getContract("ProtocolGovernor");

  const grantRoleIfMissing = async (role: string, account: string) => {
    if (!(await govTimelockController.hasRole(role, account))) {
      await govTimelockController.grantRole(role, account);
    }
  };

  const revokeRoleIfPresent = async (role: string, account: string) => {
    if (await govTimelockController.hasRole(role, account)) {
      return govTimelockController.revokeRole(role, account);
    }
  };

  if (await govTimelockController.hasRole(TIMELOCK_ADMIN_ROLE, deployer)) {
    // hand the operational roles to ProtocolGovernor so that the token-holder
    // proposal and vote path is the only way to queue, cancel or execute
    // timelock operations
    await grantRoleIfMissing(PROPOSER_ROLE, protocolGovernor.address);
    await grantRoleIfMissing(CANCELLER_ROLE, protocolGovernor.address);
    await grantRoleIfMissing(EXECUTOR_ROLE, protocolGovernor.address);

    // revoke the bootstrap deployer's operational roles before revoking its
    // TIMELOCK_ADMIN_ROLE
    await revokeRoleIfPresent(PROPOSER_ROLE, deployer);
    await revokeRoleIfPresent(CANCELLER_ROLE, deployer);
    await revokeRoleIfPresent(EXECUTOR_ROLE, deployer);
    const revokeAdminTx = await revokeRoleIfPresent(TIMELOCK_ADMIN_ROLE, deployer);
    if (revokeAdminTx) {
      await revokeAdminTx.wait();
    }

    for (const role of [PROPOSER_ROLE, CANCELLER_ROLE, EXECUTOR_ROLE]) {
      if (!(await govTimelockController.hasRole(role, protocolGovernor.address))) {
        throw new Error(`ProtocolGovernor is missing GovTimelockController role ${role}`);
      }
      if (await govTimelockController.hasRole(role, deployer)) {
        throw new Error(`bootstrap deployer still has GovTimelockController role ${role}`);
      }
    }

    if (await govTimelockController.hasRole(TIMELOCK_ADMIN_ROLE, deployer)) {
      throw new Error("bootstrap deployer still has GovTimelockController TIMELOCK_ADMIN_ROLE");
    }
    if (!(await govTimelockController.hasRole(TIMELOCK_ADMIN_ROLE, govTimelockController.address))) {
      throw new Error("GovTimelockController is missing its TIMELOCK_ADMIN_ROLE");
    }
  } else {
    console.info("skipping govTimelockController role config, as deployer does not have access to update roles");
  }
};

func.dependencies = ["GovTimelockController", "ProtocolGovernor"];
func.tags = ["ConfigureGovTimelockController"];

export default func;
