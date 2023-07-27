import { grantRoleIfNotGranted, revokeRoleIfGranted } from "../utils/role";

const rolesToRemove = {
  arbitrum: [
    {
      role: "CONFIG_KEEPER",
      member: "0xe3764a841e4a5EDa05422e1aC7FaF1266DE079e7",
    },
    {
      role: "CONTROLLER",
      member: "0x1302668D7Fd4b5d060e0555c1ADDB6AfC92eFfC7",
    },
    {
      role: "TIMELOCK_ADMIN",
      member: "0xe3764a841e4a5EDa05422e1aC7FaF1266DE079e7",
    },
    {
      role: "TIMELOCK_MULTISIG",
      member: "0xe3764a841e4a5EDa05422e1aC7FaF1266DE079e7",
    },
  ],
  avalanche: [
    {
      role: "CONFIG_KEEPER",
      member: "0xc40CdB401468419D701Bc87BA7bb9C67DFf5b110",
    },
    {
      role: "CONTROLLER",
      member: "0x31eF83a530Fde1B38EE9A18093A333D8Bbbc40D5",
    },
    {
      role: "TIMELOCK_ADMIN",
      member: "0xc40CdB401468419D701Bc87BA7bb9C67DFf5b110",
    },
    {
      role: "TIMELOCK_MULTISIG",
      member: "0xc40CdB401468419D701Bc87BA7bb9C67DFf5b110",
    },
  ],
};

const func = async ({ gmx, network }) => {
  const rolesConfig = await gmx.getRoles();
  for (const { account, roles } of rolesConfig) {
    for (const role of roles) {
      await grantRoleIfNotGranted(account, role);
    }
  }

  const removalList = rolesToRemove[network.name];
  if (removalList) {
    for (const { role, member } of removalList) {
      await revokeRoleIfGranted(member, role);
    }
  }
};

func.tags = ["Roles"];
func.dependencies = ["RoleStore"];

export default func;
