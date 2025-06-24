import { grantRoleIfNotGranted, revokeRoleIfGranted } from "../utils/role";

// example rolesToRemove format:
// {
//   arbitrum: [
//     {
//       role: "CONTROLLER",
//       member: "0x9d44B89Eb6FB382b712C562DfaFD8825829b422e",
//     },
//   ],
// };

const rolesToRemove = {
  hardhat: [],
  arbitrum: [],
  avalanche: [],
  botanix: [],
  avalancheFuji: [],
  arbitrumGoerli: [],
  arbitrumSepolia: [],
};

const func = async ({ gmx, network }) => {
  const { roles } = await gmx.getRoles();
  for (const role in roles) {
    const accounts = roles[role];
    for (const account in accounts) {
      await grantRoleIfNotGranted(account, role);
    }
  }

  const _rolesToRemove = rolesToRemove[network.name];
  for (const { member, role } of _rolesToRemove) {
    await revokeRoleIfGranted(member, role);
  }
};

func.tags = ["Roles"];
func.dependencies = ["RoleStore"];

export default func;
