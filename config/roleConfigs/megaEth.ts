export function getRoles({ syntheticKeepers, generalConfigKeepers, claimAdmins }) {
  return {
    ADL_KEEPER: syntheticKeepers.mainnet,
    FROZEN_ORDER_KEEPER: syntheticKeepers.mainnet,
    LIQUIDATION_KEEPER: syntheticKeepers.mainnet,
    ORDER_KEEPER: syntheticKeepers.mainnet,
    LIMITED_CONFIG_KEEPER: syntheticKeepers.mainnet,
    CLAIM_ADMIN: {
      "0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D": true, // security_multisig_1
      ...claimAdmins.mainnet,
      ...generalConfigKeepers.mainnet,
    },
    CONFIG_KEEPER: {
      ...generalConfigKeepers.mainnet,
    },
    FEE_KEEPER: {
      "0x43CE1d475e06c65DD879f4ec644B8e0E10ff2b6D": true, // fee_keeper_1
    },
    MARKET_KEEPER: {
      ...generalConfigKeepers.mainnet,
    },
    TIMELOCK_ADMIN: {
      // deployConfigTimelockController.ts uses this list as the controller's proposers and executors
      // (each proposer is also a canceller). These roles are set at deployment. Afterwards the role
      // admin of all of them is the controller itself, so no EOA or multisig can grant or revoke them
      // with a direct call. These role assignments (proposer/executor/canceller) can still change,
      // but only in these two ways:
      //   1. the controller acting on itself through its own timelock: a current proposer schedules an
      //      operation that calls grantRole / revokeRole on the controller, an executor runs it after
      //      the 24h delay, and any canceller (including the address being removed) can cancel it first.
      //   2. an address renouncing its own roles: direct and immediate, no delay and cannot be cancelled,
      //      but it only works on the caller's own roles.
      "0xE014cbD60A793901546178E1c16ad9132C927483": true, // timelock_admin_1
      "0x58F582455b54d7c83d03BCeed95FAf72B37fdDD7": true, // protocol_multisig_1
      "0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D": true, // security_multisig_1
      // The retired admin must stay commented out; it still holds the role on-chain (SCDEV-307).
      // "0x35ea3066F90Db13e737BBd41f1ED7B4bfF8323b3": true, // former timelock_admin (retired, still granted on-chain)
    },
    TIMELOCK_MULTISIG: {
      "0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D": true, // security_multisig_1
    },
    GOV_TOKEN_CONTROLLER: {},
    CONTROLLER: {
      "0x5Fb9121Ca153B93dD70ae53280Dc3b64E1805940": true, // MarketFactory (CONTROLLER)
      "0xA3E4c933D2227cEe0aaa2823a056843c0303a1a5": true, // GlvFactory (CONTROLLER)
      "0xc0E91b6CBd2982e92969c685227d103378Ef3762": true, // OracleStore (CONTROLLER)
      "0x611640B004719e4843552F60996360Ea6B39E75e": true, // Oracle (CONTROLLER), no live contract binds it

      // v2.2c 2026-07-15 (live; kept until the next revoke round)
      "0x5aDD4cD559424941C3d06B66c5eD71dAc7261986": true, // Config (CONTROLLER)
      "0xCb60d0A8372Cb8f8a074d304F88bA851FC5E8e29": true, // ConfigTimelockController (CONTROLLER)
      "0x1eAa0E46a40CB7D6F656193d053493658548114e": true, // TimelockConfig (CONTROLLER)
      "0xfD0596f708d9D950E0eF7b5d191e5F8e55b8a67f": true, // Oracle (CONTROLLER)
      "0xF68560cA917717639be497BF6283aC08C9Bf0264": true, // ExchangeRouter (CONTROLLER)
      "0x03B59961bF30b973fBd793A6C8ad57dA38D4D0a6": true, // SubaccountRouter (CONTROLLER)
      "0xef1BA2A3fcf0244361d63FCAe0c4772586Cd1925": true, // GlvRouter (CONTROLLER)
      "0xbAAA3a693191e2e3E0973DE641C879D1aDD84e04": true, // GelatoRelayRouter (CONTROLLER)
      "0x603B3D3aB077CA433b888c05fa59c777d5b6dCAD": true, // SubaccountGelatoRelayRouter (CONTROLLER)
      "0x321EB66dD95ad33715ee615AAb8dAC6394E7b3F9": true, // SimulationRouter (CONTROLLER)
      "0x2fFbC877Bd50c7A1c27887F012dba6469a7092F2": true, // OrderHandler (CONTROLLER)
      "0xc581aF9d20b1d95e456e4Bb9E3039aa0d48F9891": true, // JitOrderHandler (CONTROLLER)
      "0xeB09bca16e49a118daf9ae5164F050B7e7235077": true, // IncreaseOrderExecutor (CONTROLLER)
      "0xAEa9c718998fF5DB73570D80155b5c9434a1cCad": true, // DecreaseOrderExecutor (CONTROLLER)
      "0x8C184eFE8e743112DBA1fD611B5761c99FBB776f": true, // SwapOrderExecutor (CONTROLLER)
      "0x2dC2315039bf3617e815969c613428F36e9Baf98": true, // DepositHandler (CONTROLLER)
      "0xC993eF170859DAE0241a3c12B8186e456Fa1c1B0": true, // WithdrawalHandler (CONTROLLER)
      "0x882f5b61Fb61a060857065FC4AB420C96aa7A467": true, // AdlHandler (CONTROLLER)
      "0x4421E804896Caa8383e7239D87637eb4644BF40E": true, // LiquidationHandler (CONTROLLER)
      "0xd4F6C2332b36D1Ccb22C7ac479b270fa0cA26a41": true, // ShiftHandler (CONTROLLER)
      "0x9cfE0C88C34a43ae2Beb73cEC9130852E3d4aBc1": true, // GlvDepositHandler (CONTROLLER)
      "0xd2Ec2240Edc1E84Ac64d0917Ce46E9a82571609e": true, // GlvWithdrawalHandler (CONTROLLER)
      "0xcD20d56B89C07C40062845bbed0fB27b928A830F": true, // GlvShiftHandler (CONTROLLER)
      "0x807D01e681d1f97feF845602b8422032B4B0bFc0": true, // SwapHandler (CONTROLLER)
      "0xf9B01d45B2c5022429c3f745e5A2E700B02cEBeb": true, // ClaimHandler (CONTROLLER)
      "0x8A959d38216ad67AEBBF31F46Cb3cA4D7fe584c8": true, // LayerZeroProvider (CONTROLLER)
      "0x6614E9eAfE2FE583049333C03a2D6f9D7F252121": true, // MultichainClaimsRouter (CONTROLLER)
      "0x5F65a3B91923840cD5254489A57c873427bA3A91": true, // MultichainGlvRouter (CONTROLLER)
      "0x5CCD0b91Cfe6B0FBA1c98290dc39E71ff806d9bF": true, // MultichainGmRouter (CONTROLLER)
      "0x00205f26BCc52537D12fA9b0eFA5Fcc58F03ab76": true, // MultichainOrderRouter (CONTROLLER)
      "0xDB8906520812840b9835E3B84dE62C826249e20B": true, // MultichainSubaccountRouter (CONTROLLER)
      "0x62B1691B067278E5B1167d0443d4c957473611D2": true, // MultichainTransferRouter (CONTROLLER)

      // v2.2.1 2026-10-23
      "0xaB409fCaCc14Dd4234f6f86a2547f04ACC90a55e": true, // Config (CONTROLLER)
      "0x29AaB252E7B7d4BE0B1D2B50c224Db252acAa1c3": true, // ConfigTimelockController (CONTROLLER)
      "0xFFA72d61A5A83A5B6C04A353811A88FD2AdeB89b": true, // TimelockConfig (CONTROLLER)
      "0x94BcEb5Ca162A9a426d850dd400E91bEd39a2B48": true, // Oracle (CONTROLLER)
      "0x048Ee03a103d5caA06704634139495Da08E62Fd8": true, // ExchangeRouter (CONTROLLER)
      "0xe6550Bc32d08e28F9b20bFB1944551E538D7De4c": true, // SubaccountRouter (CONTROLLER)
      "0xF4706575f9241a07Af27E357Cac5149eac0A0AC7": true, // GlvRouter (CONTROLLER)
      "0xd34f5ce2a26c6B67892ef633877e381Aba4f66c5": true, // GelatoRelayRouter (CONTROLLER)
      "0x5B8c1B498CCDDCAad36B5C81e48D773Ad338145D": true, // SubaccountGelatoRelayRouter (CONTROLLER)
      "0x79B6Bf52D49d215724951c5a9A541f8A2Ee165Bc": true, // SimulationRouter (CONTROLLER)
      "0x1468e9Acd534d4C28F719fA44d8a0f589c9411a5": true, // OrderHandler (CONTROLLER)
      "0x4962B51Eca2211d394e557AE6C44c5CF4A477446": true, // JitOrderHandler (CONTROLLER)
      "0x27F3D5F595D0f244A79e1A3821c34dc0BE5019bF": true, // IncreaseOrderExecutor (CONTROLLER)
      "0x40586298d8a00Fa9434f51070B7dfeb085C29D4a": true, // DecreaseOrderExecutor (CONTROLLER)
      "0x1Fac94672d20b08A7235b0E47863b5d8aa6d95B0": true, // SwapOrderExecutor (CONTROLLER)
      "0x155280162dCB1d37B3539D057FBe4357279333e2": true, // DepositHandler (CONTROLLER)
      "0x5d32554D609B96439d751AbAa4e4146D3f2016a6": true, // WithdrawalHandler (CONTROLLER)
      "0x65240e18641eC038c7492C60cdb232732Bea980a": true, // AdlHandler (CONTROLLER)
      "0x82cD8DdbF51C80dA0128612e93b5bF36655698f5": true, // LiquidationHandler (CONTROLLER)
      "0x1040a9571962366F9Cc2b60A6b0caBcda985bEEc": true, // ShiftHandler (CONTROLLER)
      "0xe4B88494a5D7d661566d87632c296ee85CDEca4D": true, // GlvDepositHandler (CONTROLLER)
      "0x08277494e203c43360056CDf07Bb2376dfc5E35a": true, // GlvWithdrawalHandler (CONTROLLER)
      "0x1eEd675410879BDd9BF7f595d944F1b732019470": true, // GlvShiftHandler (CONTROLLER)
      "0xF6Ba2B1a33c5bdA5D7Cd5FD971E859430F465719": true, // SwapHandler (CONTROLLER)
      "0xb6B860bc82296FC87954FcfB9C6A521a4BD1Da4b": true, // ClaimHandler (CONTROLLER)
      "0xC7fC0698774b4C704aCD5521368dA5BeB397289E": true, // LayerZeroProvider (CONTROLLER)
      "0xDA1C23829B8c9c0F5F4de04B763D64BDcb62BCC4": true, // MultichainClaimsRouter (CONTROLLER)
      "0x23E7bC6069A0336F96ea2b3EB93d6A86CE432E16": true, // MultichainGlvRouter (CONTROLLER)
      "0xBF877cB8E1e8B82e23Eb7c64CfD941a2a739f94a": true, // MultichainGmRouter (CONTROLLER)
      "0x61F8cA02B89360b5860aa6840E5c043b319DF693": true, // MultichainOrderRouter (CONTROLLER)
      "0x9456C4E4D7b443D040318DD1225c15D49ec14562": true, // MultichainSubaccountRouter (CONTROLLER)
      "0xd5F5F52A580787898B1c5491f48568bC9fAa9753": true, // MultichainTransferRouter (CONTROLLER)
    },
    ROUTER_PLUGIN: {
      // v2.2c 2026-07-15 (live; kept until the next revoke round)
      "0xF68560cA917717639be497BF6283aC08C9Bf0264": true, // ExchangeRouter (ROUTER_PLUGIN)
      "0x03B59961bF30b973fBd793A6C8ad57dA38D4D0a6": true, // SubaccountRouter (ROUTER_PLUGIN)
      "0xef1BA2A3fcf0244361d63FCAe0c4772586Cd1925": true, // GlvRouter (ROUTER_PLUGIN)
      "0xbAAA3a693191e2e3E0973DE641C879D1aDD84e04": true, // GelatoRelayRouter (ROUTER_PLUGIN)
      "0x603B3D3aB077CA433b888c05fa59c777d5b6dCAD": true, // SubaccountGelatoRelayRouter (ROUTER_PLUGIN)
      "0x321EB66dD95ad33715ee615AAb8dAC6394E7b3F9": true, // SimulationRouter (ROUTER_PLUGIN)
      "0x5F65a3B91923840cD5254489A57c873427bA3A91": true, // MultichainGlvRouter (ROUTER_PLUGIN)
      "0x5CCD0b91Cfe6B0FBA1c98290dc39E71ff806d9bF": true, // MultichainGmRouter (ROUTER_PLUGIN)
      "0x00205f26BCc52537D12fA9b0eFA5Fcc58F03ab76": true, // MultichainOrderRouter (ROUTER_PLUGIN)
      "0xDB8906520812840b9835E3B84dE62C826249e20B": true, // MultichainSubaccountRouter (ROUTER_PLUGIN)
      "0x62B1691B067278E5B1167d0443d4c957473611D2": true, // MultichainTransferRouter (ROUTER_PLUGIN)

      // v2.2.1 2026-10-23
      "0x048Ee03a103d5caA06704634139495Da08E62Fd8": true, // ExchangeRouter (ROUTER_PLUGIN)
      "0xe6550Bc32d08e28F9b20bFB1944551E538D7De4c": true, // SubaccountRouter (ROUTER_PLUGIN)
      "0xF4706575f9241a07Af27E357Cac5149eac0A0AC7": true, // GlvRouter (ROUTER_PLUGIN)
      "0xd34f5ce2a26c6B67892ef633877e381Aba4f66c5": true, // GelatoRelayRouter (ROUTER_PLUGIN)
      "0x5B8c1B498CCDDCAad36B5C81e48D773Ad338145D": true, // SubaccountGelatoRelayRouter (ROUTER_PLUGIN)
      "0x79B6Bf52D49d215724951c5a9A541f8A2Ee165Bc": true, // SimulationRouter (ROUTER_PLUGIN)
      "0x23E7bC6069A0336F96ea2b3EB93d6A86CE432E16": true, // MultichainGlvRouter (ROUTER_PLUGIN)
      "0xBF877cB8E1e8B82e23Eb7c64CfD941a2a739f94a": true, // MultichainGmRouter (ROUTER_PLUGIN)
      "0x61F8cA02B89360b5860aa6840E5c043b319DF693": true, // MultichainOrderRouter (ROUTER_PLUGIN)
      "0x9456C4E4D7b443D040318DD1225c15D49ec14562": true, // MultichainSubaccountRouter (ROUTER_PLUGIN)
      "0xd5F5F52A580787898B1c5491f48568bC9fAa9753": true, // MultichainTransferRouter (ROUTER_PLUGIN)
    },
    ROLE_ADMIN: {
      // v2.2c 2026-07-15 (live; kept until the next revoke round)
      "0x1eAa0E46a40CB7D6F656193d053493658548114e": true, // TimelockConfig (ROLE_ADMIN)
      "0xCb60d0A8372Cb8f8a074d304F88bA851FC5E8e29": true, // ConfigTimelockController (ROLE_ADMIN)

      // v2.2.1 2026-10-23
      "0xFFA72d61A5A83A5B6C04A353811A88FD2AdeB89b": true, // TimelockConfig (ROLE_ADMIN)
      "0x29AaB252E7B7d4BE0B1D2B50c224Db252acAa1c3": true, // ConfigTimelockController (ROLE_ADMIN)
    },
    MULTICHAIN_READER: {},
  };
}
