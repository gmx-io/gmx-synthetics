import hre from "hardhat";
import Role from "../artifacts/contracts/role/Role.sol/Role.json";
import { hashString } from "../utils/hash";

async function validateMember({ role, member }) {
  if (["ROLE_ADMIN", "TIMELOCK_MULTISIG", "CONTROLLER"].includes(role)) {
    const code = await ethers.provider.getCode(member);
    if (code === "0x") {
      throw new Error(`EOA (Externally Owned Account) with ${role} role`);
    }
  }
}

export async function validateRoles() {
  const roles = Role.abi.map((i) => i.name);
  console.log(`checking ${roles.length} roles`);
  console.log(roles);

  const roleStore = await hre.ethers.getContract("RoleStore");

  const syntheticKeepers = {
    "0xE47b36382DC50b90bCF6176Ddb159C4b9333A7AB": true,
    "0xC539cB358a58aC67185BaAD4d5E3f7fCfc903700": true,
    "0xf1e1B2F4796d984CCb8485d43db0c64B83C1FA6d": true,
  };

  const _expectedRoles = {
    arbitrum: {
      ADL_KEEPER: syntheticKeepers,
      FROZEN_ORDER_KEEPER: syntheticKeepers,
      LIQUIDATION_KEEPER: syntheticKeepers,
      ORDER_KEEPER: syntheticKeepers,
      CONFIG_KEEPER: {
        "0xF09d66CF7dEBcdEbf965F1Ac6527E1Aa5D47A745": true, // general_keeper_1
        "0x0765678B4f2B45fa9604264a63762E2fE460df64": true, // general_keeper_2
        "0x4b6ACC5b2db1757bD49408FeE92e32D39608B5d9": true, // multisig_1
      },
      FEE_KEEPER: {
        "0x43CE1d475e06c65DD879f4ec644B8e0E10ff2b6D": true, // fee_keeper_1
      },
      MARKET_KEEPER: {
        "0x0765678B4f2B45fa9604264a63762E2fE460df64": true, // general_keeper_2
      },
      ROLE_ADMIN: {
        "0x9d44b89eb6fb382b712c562dfafd8825829b422e": true, // Timelock1
        "0x62aB76Ed722C507f297f2B97920dCA04518fe274": true, // Timelock2
      },
      ROUTER_PLUGIN: {
        "0x3B070aA6847bd0fB56eFAdB351f49BBb7619dbc2": true, // ExchangeRouter1
        "0x7C68C7866A64FA2160F78EEaE12217FFbf871fa8": true, // ExchangeRouter2
      },
      TIMELOCK_ADMIN: {
        "0x35ea3066F90Db13e737BBd41f1ED7B4bfF8323b3": true, // timelock_admin_1
        "0xE014cbD60A793901546178E1c16ad9132C927483": true, // timelock_admin_2
        "0x4b6ACC5b2db1757bD49408FeE92e32D39608B5d9": true, // multisig_1
      },
      TIMELOCK_MULTISIG: {
        "0x4b6ACC5b2db1757bD49408FeE92e32D39608B5d9": true, // multisig_1
      },
      CONTROLLER: {
        "0xa8af9b86fc47deade1bc66b12673706615e2b011": true, // OracleStore1
        "0xf5f30b10141e1f63fc11ed772931a8294a591996": true, // MarketFactory1
        "0xf86aE903B5866bCf8723B9C3642758C87f2F3Ef2": true, // Config1
        "0x9d44b89eb6fb382b712c562dfafd8825829b422e": true, // Timelock1
        "0x9f5982374e63e5b011317451a424be9e1275a03f": true, // Oracle1
        "0xd795e1894dd5ac85072c986d3eb9aba410998696": true, // SwapHandler1
        "0x12ca21bd73b5887f4d2a0054ca52510523f18c60": true, // AdlHandler1
        "0xd9aebea68de4b4a3b58833e1bc2aeb9682883ab0": true, // DepositHandler1
        "0x79b99855676db97e488f33cf52dacf552102a950": true, // WithdrawalHandler1
        "0x51e210dc8391728e2017b2ec050e40b2f458090e": true, // OrderHandler1
        "0x3b070aa6847bd0fb56efadb351f49bbb7619dbc2": true, // ExchangeRouter1
        "0x8921e1b2fb2e2b95f1df68a774bc523327e98e9f": true, // FeeHandler1
        "0xb665b6dbb45ceaf3b126cec98adb1e611b6a6aea": true, // LiquidationHandler1

        "0x226ED647C6eA2C0cE4C08578e2F37b8c2F922849": true, // Config2
        "0x62aB76Ed722C507f297f2B97920dCA04518fe274": true, // Timelock2
        "0xa11B501c2dd83Acd29F6727570f2502FAaa617F2": true, // Oracle2
        "0xF6b804F6Cc847a22F2D022C9b0373190850bE34D": true, // SwapHandler2
        "0x8514fc704317057FA86961Ba9b9490956993A5ed": true, // AdlHandler2
        "0x9Dc4f12Eb2d8405b499FB5B8AF79a5f64aB8a457": true, // DepositHandler2
        "0x9E32088F3c1a5EB38D32d1Ec6ba0bCBF499DC9ac": true, // WithdrawalHandler2
        "0x352f684ab9e97a6321a13CF03A61316B681D9fD2": true, // OrderHandler2
        "0x7C68C7866A64FA2160F78EEaE12217FFbf871fa8": true, // ExchangeRouter2
        "0xbF56A2F030C3F920F0E2aD9Cf456B9954c49383a": true, // FeeHandler2
        "0x9e0521C3dbB18E849F4955087E065E5C9C879917": true, // LiquidationHandler2
      },
    },
    avalanche: {
      ADL_KEEPER: syntheticKeepers,
      FROZEN_ORDER_KEEPER: syntheticKeepers,
      LIQUIDATION_KEEPER: syntheticKeepers,
      ORDER_KEEPER: syntheticKeepers,
      CONFIG_KEEPER: {
        "0xF09d66CF7dEBcdEbf965F1Ac6527E1Aa5D47A745": true, // general_keeper_1
        "0x0765678B4f2B45fa9604264a63762E2fE460df64": true, // general_keeper_2
        "0x15F9eBC71c539926B8f652a534d29B4Af57CaD55": true, // multisig_1
      },
      FEE_KEEPER: {
        "0x43CE1d475e06c65DD879f4ec644B8e0E10ff2b6D": true, // fee_keeper_1
      },
      MARKET_KEEPER: {
        "0x0765678B4f2B45fa9604264a63762E2fE460df64": true, // general_keeper_2
      },
      ROLE_ADMIN: {
        "0x768c0E31CC87eF5e2c3E2cdB85A4B34148cC63E5": true, // Timelock1
        "0x4Db91a1Fa4ba3c75510B2885d7d7da48E0209F38": true, // Timelock2
      },
      ROUTER_PLUGIN: {
        "0x79be2F4eC8A4143BaF963206cF133f3710856D0a": true, // ExchangeRouter1
        "0x11E590f6092D557bF71BaDEd50D81521674F8275": true, // ExchangeRouter2
      },
      TIMELOCK_ADMIN: {
        "0x35ea3066F90Db13e737BBd41f1ED7B4bfF8323b3": true, // timelock_admin_1
        "0xE014cbD60A793901546178E1c16ad9132C927483": true, // timelock_admin_2
        "0x15F9eBC71c539926B8f652a534d29B4Af57CaD55": true, // multisig_1
      },
      TIMELOCK_MULTISIG: {
        "0x15F9eBC71c539926B8f652a534d29B4Af57CaD55": true, // multisig_1
      },
      CONTROLLER: {
        "0xa6ac2e08c6d6bbd9b237e0daaecd7577996f4e84": true, // OracleStore1
        "0xc57c155faccd93f62546f329d1483e0e5b9c1241": true, // MarketFactory1
        "0x854AD2894658c5CdBcBf04d6aBb4b5680406BFB5": true, // Config1
        "0x768c0e31cc87ef5e2c3e2cdb85a4b34148cc63e5": true, // Timelock1
        "0x62e1c8f56c7de5eb5adf313e97c4bbb4e7fd956b": true, // Oracle1
        "0x8f236681c8a86eb9649b9a3dcb1bb4e05deab8a3": true, // SwapHandler1
        "0x9308e03009b62a3a7cc293b2366c36b7dbe99eee": true, // AdlHandler1
        "0x65d406bdb91813e8bc55090a7fcfed971737ce05": true, // DepositHandler1
        "0x884513492829d94ef752740c03ec3ac892ef389f": true, // WithdrawalHandler1
        "0x5ddfac1aa195fbfb72b06d3e4fc387bd11fce82f": true, // OrderHandler1
        "0x79be2f4ec8a4143baf963206cf133f3710856d0a": true, // ExchangeRouter1
        "0x6edf06cd12f48b2bf0fa6e5f98c334810b142814": true, // FeeHandler1
        "0xdfddd3a1545e34c16d2c3ab13bc3388cf9afcce3": true, // LiquidationHandler1

        "0x7309223E21dc2FFbb660E5Bd5aBF95ae06ba4Da0": true, // Config2
        "0x4Db91a1Fa4ba3c75510B2885d7d7da48E0209F38": true, // Timelock2
        "0x090FA7eb8B4647DaDbEA315E68f8f88e8E62Bd54": true, // Oracle2
        "0xEE027373517a6D96Fe62f70E9A0A395cB5a39Eee": true, // SwapHandler2
        "0x5c5DBbcDf420B5d81d4FfDBa5b26Eb24E6E60d52": true, // AdlHandler2
        "0x72fa3978E2E330C7B2debc23CB676A3ae63333F6": true, // DepositHandler2
        "0x790Ee987b9B253374d700b07F16347a7d4C4ff2e": true, // WithdrawalHandler2
        "0xd3B6E962f135634C43415d57A28E688Fb4f15A58": true, // OrderHandler2
        "0x11E590f6092D557bF71BaDEd50D81521674F8275": true, // ExchangeRouter2
        "0xc7D8E3561f1247EBDa491bA5f042699C2807C33C": true, // FeeHandler2
        "0x931C18AF613f56289253F0EeD57F315dE7dbAFcd": true, // LiquidationHandler2
      },
    },
  };

  const expectedRoles = {};

  for (const network in _expectedRoles) {
    expectedRoles[network] = {};

    for (const role in _expectedRoles[network]) {
      expectedRoles[network][role] = {};

      for (const member in _expectedRoles[network][role]) {
        expectedRoles[network][role][member.toLowerCase()] = true;
      }
    }
  }

  const rolesToAdd = [];
  const rolesToRemove = [];

  for (const role of roles) {
    const roleKey = hashString(role);
    const members = await roleStore.getRoleMembers(roleKey, 0, 100);

    const memberIsInStore = {};

    console.log(`${role} role (${roleKey}): ${members.length}`);
    for (const member of members) {
      await validateMember({ role, member });

      console.log(`   ${member}`);
      if (!expectedRoles[hre.network.name][role][member.toLowerCase()]) {
        rolesToRemove.push({
          role,
          member,
        });
      }

      memberIsInStore[member.toLowerCase()] = true;
    }

    for (const member in expectedRoles[hre.network.name][role]) {
      await validateMember({ role, member });

      if (!memberIsInStore[member.toLowerCase()]) {
        rolesToAdd.push({
          role,
          member,
        });
      }
    }
  }

  console.log(`${rolesToAdd.length} rolesToAdd`);
  console.log(rolesToAdd);
  console.log(`${rolesToRemove.length} rolesToRemove`);
  console.log(rolesToRemove);

  return { rolesToAdd, rolesToRemove };
}
