import { TIMELOCK_ADMIN_ROLE, PROPOSER_ROLE, EXECUTOR_ROLE, CANCELLER_ROLE } from "../utils/gov";

const func = async ({ getNamedAccounts }) => {
  const { deployer } = await getNamedAccounts();

  const govTimelockController = await ethers.getContract("GovTimelockController");
  const protocolGovernor = await ethers.getContract("ProtocolGovernor");

  if (await govTimelockController.hasRole(TIMELOCK_ADMIN_ROLE, deployer)) {
    await govTimelockController.grantRole(PROPOSER_ROLE, protocolGovernor.address);
    await govTimelockController.grantRole(CANCELLER_ROLE, protocolGovernor.address);
    await govTimelockController.grantRole(EXECUTOR_ROLE, protocolGovernor.address);
    await govTimelockController.revokeRole(TIMELOCK_ADMIN_ROLE, deployer);
  } else {
    console.info("skipping govTimelockController role config, as deployer does not have access to update roles");
  }
};

func.dependencies = ["GovTimelockController", "ProtocolGovernor"];
func.tags = ["ConfigureGovTimelockController"];

export default func;
