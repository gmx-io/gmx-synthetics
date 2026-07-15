export function getRoles({ syntheticKeepers, generalConfigKeepers, claimAdmins }) {
  return {
    ADL_KEEPER: syntheticKeepers.mainnet,
    FROZEN_ORDER_KEEPER: syntheticKeepers.mainnet,
    LIQUIDATION_KEEPER: syntheticKeepers.mainnet,
    ORDER_KEEPER: syntheticKeepers.mainnet,
    LIMITED_CONFIG_KEEPER: syntheticKeepers.mainnet,
    CLAIM_ADMIN: {
      "0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D": true, // security_multisig_1
      "0x0765678B4f2B45fa9604264a63762E2fE460df64": true, // general_keeper_2 (retired, still granted on-chain)
      ...claimAdmins.mainnet,
      ...generalConfigKeepers.mainnet,
    },
    CONFIG_KEEPER: {
      "0x0765678B4f2B45fa9604264a63762E2fE460df64": true, // general_keeper_2 (retired, still granted on-chain)
      ...generalConfigKeepers.mainnet,
    },
    FEE_KEEPER: {
      "0x43CE1d475e06c65DD879f4ec644B8e0E10ff2b6D": true, // fee_keeper_1
    },
    MARKET_KEEPER: {
      "0x0765678B4f2B45fa9604264a63762E2fE460df64": true, // general_keeper_2 (retired, still granted on-chain)
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
      "0x611640B004719e4843552F60996360Ea6B39E75e": true, // Oracle (CONTROLLER)

      // live generation (kept until a later revoke round)
      "0x9d5f3fac443748c28FB5dc964D74F8419F686F6D": true, // TimelockConfig (CONTROLLER)
      "0xb7779724235Bc038e41B8b39CA3212411aDD1284": true, // Config (CONTROLLER)
      "0x8c0dF501394C0fee105f92F5CA59D7B876393B99": true, // SwapHandler (CONTROLLER)
      "0xD04F9b66ac2714cafBaA777478085a662332DE84": true, // IncreaseOrderExecutor (CONTROLLER)
      "0x733b52c8c0478Dfad424488F4Ba6AaD027022AE2": true, // DecreaseOrderExecutor (CONTROLLER)
      "0x3e04e6b37B23969F3Ca1c2aAc8568322bd90BA90": true, // SwapOrderExecutor (CONTROLLER)
      "0x7d5F99Bab016b831648e278B208579e0eCdb3974": true, // OrderHandler (CONTROLLER)
      "0xCa62C570D8667a00A56EB989881ECbA4364BFe9e": true, // MultichainTransferRouter (CONTROLLER)
      "0x0d776a8A8aB967193Ad50c3b220996834D5550c7": true, // DepositHandler (CONTROLLER)
      "0x8ca83c6243b7461Ae24b5cB167912F5C055F80b0": true, // WithdrawalHandler (CONTROLLER)
      "0xBb54059D79d6E887f17aF86f724Bb1634b2C6758": true, // ShiftHandler (CONTROLLER)
      "0x041336A3DaF0a12d004a95f1511393d9A3d7236d": true, // MultichainGmRouter (CONTROLLER)
      "0x0Ca40ae32Bd2e463C7a3d9aba919d238672651DE": true, // GlvDepositHandler (CONTROLLER)
      "0xDb76b1734f8C914c09C5FbEE24399019D1E2DF36": true, // GlvWithdrawalHandler (CONTROLLER)
      "0x7EF7d01316425de5d7C2EFDf8b802A250c222faB": true, // MultichainGlvRouter (CONTROLLER)
      "0x976363dFbA3AeB8Fb10b733baD74e7099cCB558A": true, // MultichainOrderRouter (CONTROLLER)
      "0x9c41F854f123a7905907FfcF2578dFB7E47D02E0": true, // LayerZeroProvider (CONTROLLER)
      "0xf97835F08c2Bc0DA66F0e354Aa6C22b1c99657E6": true, // AdlHandler (CONTROLLER)
      "0x7e42e350FEF7c0A766590A6b2F4eF3F38D8A2988": true, // ClaimHandler (CONTROLLER)
      "0xBf96f66932C1D826C172a80bE7c062ab6b26a4CC": true, // ConfigTimelockController (CONTROLLER)
      "0xCE33CE903Aad1bA4843364adb7C627047c7Fe7fe": true, // GlvShiftHandler (CONTROLLER)
      "0xcF2a4Af134510eA1010d8CfBADB6efc937D952f0": true, // JitOrderHandler (CONTROLLER)
      "0x73B3593F01CF8e573a412D1d0c972b581794ebE0": true, // ExchangeRouter (CONTROLLER)
      "0x3133aC88af73d3187f1700a2426AD95B5d6E0562": true, // SubaccountRouter (CONTROLLER)
      "0x24eD625B9C47fDEbF088A4d12B7f9B4B2f556297": true, // GelatoRelayRouter (CONTROLLER)
      "0x505F0cCADA00F0CcB4EEbf6467531cF4dd907B0E": true, // GlvRouter (CONTROLLER)
      "0x74fCc13e7D2bf35eAaA06BC2CB3307eD6a852414": true, // LiquidationHandler (CONTROLLER)
      "0xfE9fD31e499bA6d8733Aec49ECe5b41381103433": true, // MultichainClaimsRouter (CONTROLLER)
      "0xeB8f828A4B89dc3A854f278227A2A5E136E50bF9": true, // MultichainSubaccountRouter (CONTROLLER)
      "0xD515fA0B4d704f3E2C57270F1F53BEeE16348B3b": true, // SubaccountGelatoRelayRouter (CONTROLLER)

      // v2.2c 2026-07-15 (fresh redeploy; live entries above kept until later revoke round)
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
    },
    ROUTER_PLUGIN: {
      // live generation (kept until a later revoke round)
      "0xCa62C570D8667a00A56EB989881ECbA4364BFe9e": true, // MultichainTransferRouter (ROUTER_PLUGIN)
      "0x041336A3DaF0a12d004a95f1511393d9A3d7236d": true, // MultichainGmRouter (ROUTER_PLUGIN)
      "0x7EF7d01316425de5d7C2EFDf8b802A250c222faB": true, // MultichainGlvRouter (ROUTER_PLUGIN)
      "0x976363dFbA3AeB8Fb10b733baD74e7099cCB558A": true, // MultichainOrderRouter (ROUTER_PLUGIN)
      "0x73B3593F01CF8e573a412D1d0c972b581794ebE0": true, // ExchangeRouter (ROUTER_PLUGIN)
      "0x24eD625B9C47fDEbF088A4d12B7f9B4B2f556297": true, // GelatoRelayRouter (ROUTER_PLUGIN)
      "0x505F0cCADA00F0CcB4EEbf6467531cF4dd907B0E": true, // GlvRouter (ROUTER_PLUGIN)
      "0xeB8f828A4B89dc3A854f278227A2A5E136E50bF9": true, // MultichainSubaccountRouter (ROUTER_PLUGIN)
      "0xD515fA0B4d704f3E2C57270F1F53BEeE16348B3b": true, // SubaccountGelatoRelayRouter (ROUTER_PLUGIN)
      "0x3133aC88af73d3187f1700a2426AD95B5d6E0562": true, // SubaccountRouter (ROUTER_PLUGIN)

      // v2.2c 2026-07-15 (fresh redeploy; live entries above kept until later revoke round)
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
    },
    ROLE_ADMIN: {
      // live generation (kept until a later revoke round)
      "0x9d5f3fac443748c28FB5dc964D74F8419F686F6D": true, // TimelockConfig (ROLE_ADMIN)
      "0xBf96f66932C1D826C172a80bE7c062ab6b26a4CC": true, // ConfigTimelockController (ROLE_ADMIN)

      // v2.2c 2026-07-15 (fresh redeploy; live entries above kept until later revoke round)
      "0x1eAa0E46a40CB7D6F656193d053493658548114e": true, // TimelockConfig (ROLE_ADMIN)
      "0xCb60d0A8372Cb8f8a074d304F88bA851FC5E8e29": true, // ConfigTimelockController (ROLE_ADMIN)
    },
    MULTICHAIN_READER: {},
  };
}
