import { grantRoleIfNotGranted, revokeRoleIfGranted } from "../utils/role";

const rolesToRemove = {
  arbitrum: [
    {
      role: "CONFIG_KEEPER",
      member: "0x1c81F9dFD3DE4f9Bd2C11924D60f18a09Af13165",
    },
    {
      role: "CONTROLLER",
      member: "0x1cf1509595844EBFAbc0Af87Cea045D4fA3824Ac",
    },
    {
      role: "CONTROLLER",
      member: "0xA23B81a89Ab9D7D89fF8fc1b5d8508fB75Cc094d",
    },
    {
      role: "CONTROLLER",
      member: "0x1196D058Ad6d7454f2FBaB1F683Df4115A06Ac63",
    },
    {
      role: "CONTROLLER",
      member: "0xd6922E889cE4CF14e59427F20e7d857ff81A5A9D",
    },
    {
      role: "CONTROLLER",
      member: "0x50474CAe810B316c294111807F94F9f48527e7F8",
    },
    {
      role: "CONTROLLER",
      member: "0x58300b19D0B2b67471ADDF5674A0b7650D8F12A9",
    },
    {
      role: "CONTROLLER",
      member: "0xfFC63573B55B39b75b1e44e54C308e44505E0D28",
    },
    {
      role: "CONTROLLER",
      member: "0x6EEFd9F9D87939A26E91CbC461683aC13279CFcA",
    },
    {
      role: "CONTROLLER",
      member: "0x76db6cd04Da2153149dd554fB5845D6FF51Ca82f",
    },
    {
      role: "CONTROLLER",
      member: "0x2e246061BE08DC56d33E03Dc0cb962C2155722b5",
    },
    {
      role: "CONTROLLER",
      member: "0x45786dF3F9023ff1d20DE99c05721DE81B913A57",
    },
    {
      role: "CONTROLLER",
      member: "0x6d9eE37998DDA3a118F5CeB8Ed2A2EF9D5492838",
    },
    {
      role: "CONTROLLER",
      member: "0xa9F2F994C6B0d66e3C0E3C6F3AebCae4C1195357",
    },
    {
      role: "CONTROLLER",
      member: "0x7F8dD086a4f8d561eFC16D0d136684ed78fbf8fE",
    },
    {
      role: "CONTROLLER",
      member: "0xF57E662372cB4E0af78EFa17BBE98834Cff4c1BE",
    },
    {
      role: "CONTROLLER",
      member: "0x381665e4078cB77240F82918b967Ad9aDAd5C10c",
    },
    {
      role: "CONTROLLER",
      member: "0x5c7792f047399a02a7dbacA67C21b422a238168a",
    },
    {
      role: "CONTROLLER",
      member: "0x07D7C9e1df9E92Dfee48947739d26e8E7a1AAB2c",
    },
    {
      role: "CONTROLLER",
      member: "0xEFbbcda3f586b0f79273fc1A1edDbFc00AEF8928",
    },
    {
      role: "CONTROLLER",
      member: "0xf2416da73d08E4fe567e5c18243daeb2859c29Df",
    },
    {
      role: "CONTROLLER",
      member: "0x93c2127963bF471EdBcb0f31B84EEe4AA686Bb8F",
    },
    {
      role: "CONTROLLER",
      member: "0x82aDe05EF673954D54d1eB2178b2059c9380b888",
    },
    {
      role: "ROUTER_PLUGIN",
      member: "0xfFC63573B55B39b75b1e44e54C308e44505E0D28",
    },
    {
      role: "ROUTER_PLUGIN",
      member: "0x381665e4078cB77240F82918b967Ad9aDAd5C10c",
    },
    {
      role: "ROUTER_PLUGIN",
      member: "0x82aDe05EF673954D54d1eB2178b2059c9380b888",
    },
    {
      role: "TIMELOCK_ADMIN",
      member: "0xE97e935d4F5a533E61BaaF0a3CC85DB33ac71636",
    },
    {
      role: "TIMELOCK_ADMIN",
      member: "0x1c81F9dFD3DE4f9Bd2C11924D60f18a09Af13165",
    },
    {
      role: "TIMELOCK_MULTISIG",
      member: "0x1c81F9dFD3DE4f9Bd2C11924D60f18a09Af13165",
    },
  ],
  avalanche: [
    {
      role: "CONFIG_KEEPER",
      member: "0x1c81F9dFD3DE4f9Bd2C11924D60f18a09Af13165",
    },
    {
      role: "CONTROLLER",
      member: "0xa60BEc0e4fd65F8b177d58c80E8464c17e3D50f6",
    },
    {
      role: "CONTROLLER",
      member: "0x5E0C3451CF23E4Ba512D5075479f4E34F122EF15",
    },
    {
      role: "CONTROLLER",
      member: "0x7072BBF39b850Ff1A72A142fb750A3D23d98674F",
    },
    {
      role: "CONTROLLER",
      member: "0x8cC442a557BCdE6AefbE70027971cc96336438f8",
    },
    {
      role: "CONTROLLER",
      member: "0x4BaA24f93a657f0c1b4A0Ffc72B91011E35cA46b",
    },
    {
      role: "CONTROLLER",
      member: "0xb7779724235Bc038e41B8b39CA3212411aDD1284",
    },
    {
      role: "CONTROLLER",
      member: "0xF516BC01c50eebdBad4d7E506c8f690ae8EAFc52",
    },
    {
      role: "CONTROLLER",
      member: "0x7452c558d45f8afC8c83dAe62C3f8A5BE19c71f6",
    },
    {
      role: "CONTROLLER",
      member: "0x611640B004719e4843552F60996360Ea6B39E75e",
    },
    {
      role: "CONTROLLER",
      member: "0xED467Ce941BA9ec2aa74DCDAea7A53995840a79d",
    },
    {
      role: "CONTROLLER",
      member: "0xEE4A911b13B1Ad0d83f82c673EafeF3D2d904286",
    },
    {
      role: "CONTROLLER",
      member: "0x370e7a3B3A8070dfE461f03Dd6E7DFF4B87399e7",
    },
    {
      role: "CONTROLLER",
      member: "0xFCB212F7032F145cbe0fafd4A14Dd84b31AaE366",
    },
    {
      role: "CONTROLLER",
      member: "0xcbd255Dd6394F59126d91320f565fE69C8d75D8E",
    },
    {
      role: "CONTROLLER",
      member: "0x964aAb0542F643746F0Cc2d50E6d3426e1A23fC0",
    },
    {
      role: "CONTROLLER",
      member: "0x0b1C578d4106A1C0637cf9aF40d5CEf14E3D3166",
    },
    {
      role: "CONTROLLER",
      member: "0xd7cC34f0438f1E7a50F90008761cEB022a161BCA",
    },
    {
      role: "CONTROLLER",
      member: "0x242324C66a5BedAFCDB71124b3A6fc4f39d943Cb",
    },
    {
      role: "CONTROLLER",
      member: "0xE3651F5D5616BaC2D4485C6d8CE8bc381Dac70F9",
    },
    {
      role: "CONTROLLER",
      member: "0x364C60dC09108DeD72378e7d800F9b7BE034aa59",
    },
    {
      role: "CONTROLLER",
      member: "0xAeB4B46cB013B9d36aa1219Cb8ff328E01E5Bf24",
    },
    {
      role: "CONTROLLER",
      member: "0x9a535f9343434D96c4a39fF1d90cC685A4F6Fb20",
    },
    {
      role: "ROUTER_PLUGIN",
      member: "0xF516BC01c50eebdBad4d7E506c8f690ae8EAFc52",
    },
    {
      role: "ROUTER_PLUGIN",
      member: "0x0b1C578d4106A1C0637cf9aF40d5CEf14E3D3166",
    },
    {
      role: "ROUTER_PLUGIN",
      member: "0x9a535f9343434D96c4a39fF1d90cC685A4F6Fb20",
    },
    {
      role: "TIMELOCK_ADMIN",
      member: "0xE97e935d4F5a533E61BaaF0a3CC85DB33ac71636",
    },
    {
      role: "TIMELOCK_ADMIN",
      member: "0x1c81F9dFD3DE4f9Bd2C11924D60f18a09Af13165",
    },
    {
      role: "TIMELOCK_MULTISIG",
      member: "0x1c81F9dFD3DE4f9Bd2C11924D60f18a09Af13165",
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
