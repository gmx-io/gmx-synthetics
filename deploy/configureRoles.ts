import { grantRoleIfNotGranted, revokeRoleIfGranted } from "../utils/role";

const rolesToRemove = {
  arbitrum: [
    {
      role: "CONFIG_KEEPER",
      member: "0xE47b36382DC50b90bCF6176Ddb159C4b9333A7AB",
    },
    {
      role: "CONFIG_KEEPER",
      member: "0xE97e935d4F5a533E61BaaF0a3CC85DB33ac71636",
    },
    {
      role: "CONTROLLER",
      member: "0xcfd64885462ebFa4215e2F1F956D8083e688d33F",
    },
    {
      role: "MARKET_KEEPER",
      member: "0xE97e935d4F5a533E61BaaF0a3CC85DB33ac71636",
    },
  ],
  avalanche: [
    {
      role: "CONFIG_KEEPER",
      member: "0xE47b36382DC50b90bCF6176Ddb159C4b9333A7AB",
    },
    {
      role: "CONFIG_KEEPER",
      member: "0xE97e935d4F5a533E61BaaF0a3CC85DB33ac71636",
    },
    {
      role: "CONTROLLER",
      member: "0x61B6ae0dd5f5F4fC79D94f118fd4ab2864f0eEf9",
    },
    {
      role: "MARKET_KEEPER",
      member: "0xE97e935d4F5a533E61BaaF0a3CC85DB33ac71636",
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
