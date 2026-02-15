export function getRoles({ syntheticKeepers, generalConfigKeepers, claimAdmins }) {
  return {
    ADL_KEEPER: syntheticKeepers.mainnet,
    FROZEN_ORDER_KEEPER: syntheticKeepers.mainnet,
    LIQUIDATION_KEEPER: syntheticKeepers.mainnet,
    ORDER_KEEPER: syntheticKeepers.mainnet,
    LIMITED_CONFIG_KEEPER: syntheticKeepers.mainnet,
    CLAIM_ADMIN: {
      ...claimAdmins.mainnet,
      ...generalConfigKeepers.mainnet,
    },
    CONFIG_KEEPER: {
      ...generalConfigKeepers.mainnet,
      "0xE7BfFf2aB721264887230037940490351700a068": true, // TEMP: deployer
    },
    FEE_KEEPER: {
      "0x43CE1d475e06c65DD879f4ec644B8e0E10ff2b6D": true, // fee_keeper_1
    },
    MARKET_KEEPER: {
      ...generalConfigKeepers.mainnet,
      "0xE7BfFf2aB721264887230037940490351700a068": true, // TEMP: deployer
    },
    TIMELOCK_ADMIN: {
      "0x35ea3066F90Db13e737BBd41f1ED7B4bfF8323b3": true, // timelock_admin_1
    },
    TIMELOCK_MULTISIG: {
      "0x35ea3066F90Db13e737BBd41f1ED7B4bfF8323b3": true, // timelock_admin_1
    },
    GOV_TOKEN_CONTROLLER: {},
    CONTROLLER: {
      "0xE7BfFf2aB721264887230037940490351700a068": true, // TEMP: deployer

      "0x5Fb9121Ca153B93dD70ae53280Dc3b64E1805940": true, // MarketFactory (CONTROLLER)
      "0xA3E4c933D2227cEe0aaa2823a056843c0303a1a5": true, // GlvFactory (CONTROLLER)
      "0xc0E91b6CBd2982e92969c685227d103378Ef3762": true, // OracleStore (CONTROLLER)
      "0x611640B004719e4843552F60996360Ea6B39E75e": true, // Oracle (CONTROLLER)

      "0xb7779724235Bc038e41B8b39CA3212411aDD1284": true, // Config (CONTROLLER)
      "0xBf96f66932C1D826C172a80bE7c062ab6b26a4CC": true, // ConfigTimelockController (CONTROLLER)
      "0x9d5f3fac443748c28FB5dc964D74F8419F686F6D": true, // TimelockConfig (CONTROLLER)
      "0x73B3593F01CF8e573a412D1d0c972b581794ebE0": true, // ExchangeRouter (CONTROLLER)
      "0x3133aC88af73d3187f1700a2426AD95B5d6E0562": true, // SubaccountRouter (CONTROLLER)
      "0x505F0cCADA00F0CcB4EEbf6467531cF4dd907B0E": true, // GlvRouter (CONTROLLER)
      "0x24eD625B9C47fDEbF088A4d12B7f9B4B2f556297": true, // GelatoRelayRouter (CONTROLLER)
      "0xD515fA0B4d704f3E2C57270F1F53BEeE16348B3b": true, // SubaccountGelatoRelayRouter (CONTROLLER)
      "0x7d5F99Bab016b831648e278B208579e0eCdb3974": true, // OrderHandler (CONTROLLER)
      "0xcF2a4Af134510eA1010d8CfBADB6efc937D952f0": true, // JitOrderHandler (CONTROLLER)
      "0xD04F9b66ac2714cafBaA777478085a662332DE84": true, // IncreaseOrderExecutor (CONTROLLER)
      "0x733b52c8c0478Dfad424488F4Ba6AaD027022AE2": true, // DecreaseOrderExecutor (CONTROLLER)
      "0x3e04e6b37B23969F3Ca1c2aAc8568322bd90BA90": true, // SwapOrderExecutor (CONTROLLER)
      "0x0d776a8A8aB967193Ad50c3b220996834D5550c7": true, // DepositHandler (CONTROLLER)
      "0x8ca83c6243b7461Ae24b5cB167912F5C055F80b0": true, // WithdrawalHandler (CONTROLLER)
      "0xf97835F08c2Bc0DA66F0e354Aa6C22b1c99657E6": true, // AdlHandler (CONTROLLER)
      "0x74fCc13e7D2bf35eAaA06BC2CB3307eD6a852414": true, // LiquidationHandler (CONTROLLER)
      "0xBb54059D79d6E887f17aF86f724Bb1634b2C6758": true, // ShiftHandler (CONTROLLER)
      "0x0Ca40ae32Bd2e463C7a3d9aba919d238672651DE": true, // GlvDepositHandler (CONTROLLER)
      "0xDb76b1734f8C914c09C5FbEE24399019D1E2DF36": true, // GlvWithdrawalHandler (CONTROLLER)
      "0xCE33CE903Aad1bA4843364adb7C627047c7Fe7fe": true, // GlvShiftHandler (CONTROLLER)
      "0x8c0dF501394C0fee105f92F5CA59D7B876393B99": true, // SwapHandler (CONTROLLER)
      "0x7e42e350FEF7c0A766590A6b2F4eF3F38D8A2988": true, // ClaimHandler (CONTROLLER)
      "0x9c41F854f123a7905907FfcF2578dFB7E47D02E0": true, // LayerZeroProvider (CONTROLLER)
      "0xfE9fD31e499bA6d8733Aec49ECe5b41381103433": true, // MultichainClaimsRouter (CONTROLLER)
      "0x7EF7d01316425de5d7C2EFDf8b802A250c222faB": true, // MultichainGlvRouter (CONTROLLER)
      "0x041336A3DaF0a12d004a95f1511393d9A3d7236d": true, // MultichainGmRouter (CONTROLLER)
      "0x976363dFbA3AeB8Fb10b733baD74e7099cCB558A": true, // MultichainOrderRouter (CONTROLLER)
      "0xeB8f828A4B89dc3A854f278227A2A5E136E50bF9": true, // MultichainSubaccountRouter (CONTROLLER)
      "0xCa62C570D8667a00A56EB989881ECbA4364BFe9e": true, // MultichainTransferRouter (CONTROLLER)
    },
    ROUTER_PLUGIN: {
      "0x73B3593F01CF8e573a412D1d0c972b581794ebE0": true, // ExchangeRouter (ROUTER_PLUGIN)
      "0x3133aC88af73d3187f1700a2426AD95B5d6E0562": true, // SubaccountRouter (ROUTER_PLUGIN)
      "0x505F0cCADA00F0CcB4EEbf6467531cF4dd907B0E": true, // GlvRouter (ROUTER_PLUGIN)
      "0x24eD625B9C47fDEbF088A4d12B7f9B4B2f556297": true, // GelatoRelayRouter (ROUTER_PLUGIN)
      "0xD515fA0B4d704f3E2C57270F1F53BEeE16348B3b": true, // SubaccountGelatoRelayRouter (ROUTER_PLUGIN)
      "0x7EF7d01316425de5d7C2EFDf8b802A250c222faB": true, // MultichainGlvRouter (ROUTER_PLUGIN)
      "0x041336A3DaF0a12d004a95f1511393d9A3d7236d": true, // MultichainGmRouter (ROUTER_PLUGIN)
      "0x976363dFbA3AeB8Fb10b733baD74e7099cCB558A": true, // MultichainOrderRouter (ROUTER_PLUGIN)
      "0xeB8f828A4B89dc3A854f278227A2A5E136E50bF9": true, // MultichainSubaccountRouter (ROUTER_PLUGIN)
      "0xCa62C570D8667a00A56EB989881ECbA4364BFe9e": true, // MultichainTransferRouter (ROUTER_PLUGIN)
    },
    ROLE_ADMIN: {
      "0x35ea3066F90Db13e737BBd41f1ED7B4bfF8323b3": true, // timelock_admin_1
      "0x9d5f3fac443748c28FB5dc964D74F8419F686F6D": true, // TimelockConfig (ROLE_ADMIN)
      "0xBf96f66932C1D826C172a80bE7c062ab6b26a4CC": true, // ConfigTimelockController (ROLE_ADMIN)
    },
    MULTICHAIN_READER: {},
  };
}
