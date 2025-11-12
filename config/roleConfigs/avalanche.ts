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
      "0x15F9eBC71c539926B8f652a534d29B4Af57CaD55": true, // multisig_1
      "0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D": true, // security_multisig_1
      "0x704a713CAe6068D1959a782B20933F105287825d": true, // ConfigSyncer
      ...generalConfigKeepers.mainnet,
    },
    FEE_KEEPER: {
      "0x43CE1d475e06c65DD879f4ec644B8e0E10ff2b6D": true, // fee_keeper_1
    },
    // FEE_DISTRIBUTION_KEEPER: generalConfigKeepers.mainnet,
    MARKET_KEEPER: {
      ...generalConfigKeepers.mainnet,
    },
    TIMELOCK_ADMIN: {
      "0x35ea3066F90Db13e737BBd41f1ED7B4bfF8323b3": true, // timelock_admin_1
      "0xE014cbD60A793901546178E1c16ad9132C927483": true, // timelock_admin_2
      "0x15F9eBC71c539926B8f652a534d29B4Af57CaD55": true, // multisig_1
      "0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D": true, // security_multisig_1
    },
    TIMELOCK_MULTISIG: {
      "0x15F9eBC71c539926B8f652a534d29B4Af57CaD55": true, // multisig_1
      "0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D": true, // security_multisig_1
    },
    GOV_TOKEN_CONTROLLER: {
      "0x091eD806490Cc58Fd514441499e58984cCce0630": true, // RewardRouterV2_2
    },
    CONTROLLER: {
      "0xc57C155FacCd93F62546F329D1483E0E5b9C1241": true, // MarketFactory
      "0x5d6B84086DA6d4B0b6C0dF7E02f8a6A039226530": true, // GlvFactory
      "0xA6aC2e08C6d6bbD9B237e0DaaEcd7577996f4e84": true, // OracleStore
      "0x1A3A103F9F536a0456C9b205152A3ac2b3c54490": true, // FeeHandler
      "0xAd7a7568F500F65AEA3D9417A210CBc5dcD7b273": true, // FeeHandler Oracle
      "0xE1d5a068c5b75E0c7Ea1A9Fe8EA056f9356C6fFD": true, // Oracle

      "0x5e13a7d1Ff2313e579387a7145f106c8D6B9c2F2": true, // Config
      "0x704a713CAe6068D1959a782B20933F105287825d": true, // ConfigSyncer
      "0x40f686cE9Fbb8eE1e069d91d59a96F0Ac3770841": true, // ConfigTimelockController
      "0xD52b78E81289A9b056B583460bfb605f9887EE4E": true, // TimelockConfig
      "0x9Ade8D48d3B1d88c640eed52D61F5becF18e7Aef": true, // ExchangeRouter
      "0x91c72741d491C48DBF303230D162f457D404f7B9": true, // SubaccountRouter
      "0xaE896FA1Ae013F43Bf379A8659f47D07Fb500F95": true, // GlvRouter
      "0xa086FFe1fC62859c5BB587510b93Cc316C2023A3": true, // GelatoRelayRouter
      "0x39E68cE7F613c24ec4706bdD682160363E24E611": true, // SubaccountGelatoRelayRouter
      "0x8862338a70C27f1A343DD7b1AD18F52387BbaAcF": true, // OrderHandler
      "0x99799226EeAAd9B33171D47a95e1305869c64961": true, // IncreaseOrderExecutor
      "0x205dd9E03987BD5180ad2A4fA1dc64776A5480E2": true, // DecreaseOrderExecutor
      "0x84579DeB73F09D4Ca7FE1D732ffb0Bb2E9A70119": true, // SwapOrderExecutor
      "0xfb0f84A55dc9982d96Ae62109B5A7F4E05Ba3B5a": true, // DepositHandler
      "0x2FCB6cD8d29006cCDc067797E1f468a730a7EC54": true, // WithdrawalHandler
      "0x6cc7ed093B89A47A209562CF0184F392178dce85": true, // AdlHandler
      "0xEB472754dbc1e4F234708C26599112F3Cc6844EF": true, // LiquidationHandler
      "0x96A0CEB943ab377e5aB57D5b11c1bec4ab022162": true, // ShiftHandler
      "0x0eC1F54cd316A9Db85fEcafDd2CCdE8Dd36458d6": true, // GlvDepositHandler
      "0x441e058004487B364Eda07145Fb9C0245fc892D1": true, // GlvWithdrawalHandler
      "0xc658ACff903559304Bf716dB57dE4E06dD5ec5ff": true, // GlvShiftHandler
      "0x5b25a0F6D84C6163c38348adDB70aae38BEA6551": true, // SwapHandler
      "0x4eF055DA26000C807ea986CC8632E00B68f8FF4B": true, // ClaimHandler
      "0x7BDab864100Cb55B1770A8F8871FB25f2458cE89": true, // LayerZeroProvider
      "0x1391325227384096ad164e85f69a36CeDd5B6fD7": true, // MultichainClaimsRouter
      "0x93e3ae5Ba6F5b6685a03c8F45B61034580B5b9E5": true, // MultichainGlvRouter
      "0xC13b0fDD57886D5b66A5930Ce7Bb919cEAC91F2B": true, // MultichainGmRouter
      "0x5D6edFdCb872b0F913AE5F92107DdeFE6F579a14": true, // MultichainOrderRouter
      "0xDe87e3Ec75793B72D39030a00579abD4014Ebe51": true, // MultichainSubaccountRouter
      "0x58708dD4C9A5e5117fa7EC39Aa5164e60cB12860": true, // MultichainTransferRouter
    },
    ROUTER_PLUGIN: {
      "0x9Ade8D48d3B1d88c640eed52D61F5becF18e7Aef": true, // ExchangeRouter
      "0x91c72741d491C48DBF303230D162f457D404f7B9": true, // SubaccountRouter
      "0xaE896FA1Ae013F43Bf379A8659f47D07Fb500F95": true, // GlvRouter
      "0xa086FFe1fC62859c5BB587510b93Cc316C2023A3": true, // GelatoRelayRouter
      "0x39E68cE7F613c24ec4706bdD682160363E24E611": true, // SubaccountGelatoRelayRouter
      "0x93e3ae5Ba6F5b6685a03c8F45B61034580B5b9E5": true, // MultichainGlvRouter
      "0xC13b0fDD57886D5b66A5930Ce7Bb919cEAC91F2B": true, // MultichainGmRouter
      "0x5D6edFdCb872b0F913AE5F92107DdeFE6F579a14": true, // MultichainOrderRouter
      "0xDe87e3Ec75793B72D39030a00579abD4014Ebe51": true, // MultichainSubaccountRouter
      "0x58708dD4C9A5e5117fa7EC39Aa5164e60cB12860": true, // MultichainTransferRouter
    },
    ROLE_ADMIN: {
      "0xD52b78E81289A9b056B583460bfb605f9887EE4E": true, // TimelockConfig
      "0x40f686cE9Fbb8eE1e069d91d59a96F0Ac3770841": true, // ConfigTimelockController
    },
  };
}
