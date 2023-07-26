import hre from "hardhat";
import Role from "../artifacts/contracts/role/Role.sol/Role.json";
import { hashString } from "../utils/hash";

async function main() {
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
        "0xE47b36382DC50b90bCF6176Ddb159C4b9333A7AB": true, // general_keeper_1
        "0xE97e935d4F5a533E61BaaF0a3CC85DB33ac71636": true, // general_keeper_2
        "0xe3764a841e4a5EDa05422e1aC7FaF1266DE079e7": true, // multisig_1
      },
      FEE_KEEPER: {
        "0x43CE1d475e06c65DD879f4ec644B8e0E10ff2b6D": true, // fee_keeper_1
      },
      MARKET_KEEPER: {
        "0xE7BfFf2aB721264887230037940490351700a068": true, // deployer
        "0xE97e935d4F5a533E61BaaF0a3CC85DB33ac71636": true, // general_keeper_2
      },
      ROLE_ADMIN: {
        "0xE7BfFf2aB721264887230037940490351700a068": true, // deployer
        "0x9d44B89Eb6FB382b712C562DfaFD8825829b422e": true, // timelock_1
      },
      ROUTER_PLUGIN: {
        "0x3B070aA6847bd0fB56eFAdB351f49BBb7619dbc2": true, // ExchangeRouter
      },
      TIMELOCK_ADMIN: {
        "0x35ea3066F90Db13e737BBd41f1ED7B4bfF8323b3": true, // timelock_admin_1
        "0xe3764a841e4a5EDa05422e1aC7FaF1266DE079e7": true, // multisig_1
      },
      TIMELOCK_MULTISIG: {
        "0xe3764a841e4a5EDa05422e1aC7FaF1266DE079e7": true, // multisig_1
      },
      CONTROLLER: {
        "0xe7bfff2ab721264887230037940490351700a068": true, // deployer
        "0xa8af9b86fc47deade1bc66b12673706615e2b011": true, // OracleStore1
        "0xf5f30b10141e1f63fc11ed772931a8294a591996": true, // MarketFactory1
        "0x1302668d7fd4b5d060e0555c1addb6afc92effc7": true, // Config1
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
        "0x9f5982374e63e5B011317451a424bE9E1275a03f": true, // Oracle1
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

  const rolesToRemove = [];

  for (const role of roles) {
    const roleKey = hashString(role);
    const members = await roleStore.getRoleMembers(roleKey, 0, 100);
    console.log(`${role} role: ${members.length}`);
    for (const member of members) {
      console.log(`   ${member}`);
      if (!expectedRoles[hre.network.name][role][member.toLowerCase()]) {
        rolesToRemove.push({
          role,
          member,
        });
      }
    }
  }

  console.log(`${rolesToRemove.length} rolesToRemove`);
  console.log(rolesToRemove);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
