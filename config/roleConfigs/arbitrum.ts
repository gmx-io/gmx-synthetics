export function getRoles({
  syntheticKeepers,
  chainlinkKeepers,
  gelatoKeepers,
  claimAdmins,
  generalConfigKeepers,
  fundDistributors,
}) {
  return {
    ADL_KEEPER: syntheticKeepers.mainnet,
    FROZEN_ORDER_KEEPER: syntheticKeepers.mainnet,
    LIQUIDATION_KEEPER: syntheticKeepers.mainnet,
    ORDER_KEEPER: { ...syntheticKeepers.mainnet, ...chainlinkKeepers.arbitrum, ...gelatoKeepers.arbitrum },
    LIMITED_CONFIG_KEEPER: syntheticKeepers.mainnet,
    CLAIM_ADMIN: {
      "0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D": true, // security_multisig_1
      ...claimAdmins.mainnet,
      ...generalConfigKeepers.mainnet,
    },
    CONTRIBUTOR_KEEPER: {
      "0x49B373D422BdA4C6BfCdd5eC1E48A9a26fdA2F8b": true, // contributor_keeper_1
    },
    CONTRIBUTOR_DISTRIBUTOR: {
      ...generalConfigKeepers.mainnet,
      ...fundDistributors.mainnet,
    },
    CONFIG_KEEPER: {
      "0x4b6ACC5b2db1757bD49408FeE92e32D39608B5d9": true, // multisig_1
      "0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D": true, // security_multisig_1
      "0x2966bE26c325796c0e63D769AbD457532411Ffed": true, // ConfigSyncer (CONFIG_KEEPER)
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
      "0x4b6ACC5b2db1757bD49408FeE92e32D39608B5d9": true, // multisig_1
      "0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D": true, // security_multisig_1
    },
    TIMELOCK_MULTISIG: {
      "0x4b6ACC5b2db1757bD49408FeE92e32D39608B5d9": true, // multisig_1
      "0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D": true, // security_multisig_1
    },
    GOV_TOKEN_CONTROLLER: {
      "0x5E4766F932ce00aA4a1A82d3Da85adf15C5694A1": true, // RewardRouterV2
    },
    CONTROLLER: {
      "0xf5F30B10141E1F63FC11eD772931A8294a591996": true, // MarketFactory
      "0xdaFa7Deb67805d7498Aa926002bB2d713D1d9256": true, // GlvFactory
      "0xA8AF9B86fC47deAde1bc66B12673706615E2B011": true, // OracleStore
      "0x7EB417637a3E6d1C19E6d69158c47610b7a5d9B3": true, // FeeHandler
      "0xb8fc96d7a413C462F611A7aC0C912c2FE26EAbC4": true, // FeeHandler Oracle
      "0x4729D9f61c0159F5e02D2C2e5937B3225e55442C": true, // ContributorHandler
      "0x7F01614cA5198Ec979B1aAd1DAF0DE7e0a215BDF": true, // Oracle

      "0x0BBbbF9D0cbdE8069e926c859E530B00Bfe90072": true, // Config (CONTROLLER)
      "0x2966bE26c325796c0e63D769AbD457532411Ffed": true, // ConfigSyncer (CONTROLLER)
      "0xC77E6C0ca99E02660A23c00A860Dd5a8912DEaF5": true, // ConfigTimelockController (CONTROLLER)
      "0x4A1D9e342E2dB5f4a02c9eF5cB29CaF289f31599": true, // TimelockConfig (CONTROLLER)
      "0x1C3fa76e6E1088bCE750f23a5BFcffa1efEF6A41": true, // ExchangeRouter (CONTROLLER)
      "0xdD00F639725E19a209880A44962Bc93b51B1B161": true, // SubaccountRouter (CONTROLLER)
      "0x7EAdEE2ca1b4D06a0d82fDF03D715550c26AA12F": true, // GlvRouter (CONTROLLER)
      "0xa9090E2fd6cD8Ee397cF3106189A7E1CFAE6C59C": true, // GelatoRelayRouter (CONTROLLER)
      "0x517602BaC704B72993997820981603f5E4901273": true, // SubaccountGelatoRelayRouter (CONTROLLER)
      "0x63492B775e30a9E6b4b4761c12605EB9d071d5e9": true, // OrderHandler (CONTROLLER)
      "0x493222795222015658F8FCE432516f74687e2083": true, // JitOrderHandler (CONTROLLER)
      "0xC4eccCE7e5231d453991f8C13459999B14AFff24": true, // IncreaseOrderExecutor (CONTROLLER)
      "0xf7B962B085775A96A99E3dD38dfFf09D7e270088": true, // DecreaseOrderExecutor (CONTROLLER)
      "0xAFfd408F3f95f83e3b6326C7Bacbad08EdfAd6Fe": true, // SwapOrderExecutor (CONTROLLER)
      "0x33871b8568eDC4adf33338cdD8cF52a0eCC84D42": true, // DepositHandler (CONTROLLER)
      "0x11e9E7464f3Bc887a7290ec41fCd22f619b177fd": true, // WithdrawalHandler (CONTROLLER)
      "0x262df96a3a35D0A7950C5669238662df58Ae8bf7": true, // AdlHandler (CONTROLLER)
      "0xaf157Eb8e2398A8E1Fc1dA929974652b9ba9BC25": true, // LiquidationHandler (CONTROLLER)
      "0x5F66cBb8D1766e6CE3c1ffba0987aeDe7a1DFf53": true, // ShiftHandler (CONTROLLER)
      "0x749291a06b1Eb031288A5c864F68de83e4091Ff8": true, // GlvDepositHandler (CONTROLLER)
      "0x1EEA01a3592b8943737977b93ed24be7842D2427": true, // GlvWithdrawalHandler (CONTROLLER)
      "0xae7e42E817977c3ef656AD5b5A604a5550072f96": true, // GlvShiftHandler (CONTROLLER)
      "0x32c206D8eA6903C3Ca5BDEd94877C72d92BDE82a": true, // SwapHandler (CONTROLLER)
      "0x8a83F2a71A53d3860a60C9F2E68AB2C46Ff9624e": true, // ClaimHandler (CONTROLLER)
      "0xB6DE222dAef5029f31b8fABE498D34f3c491Ef85": true, // LayerZeroProvider (CONTROLLER)
      "0x277B4c0e8A76Fa927C9881967a4475Fd6E234e95": true, // MultichainClaimsRouter (CONTROLLER)
      "0xabcBbe23BD8E0dDD344Ff5fd1439b785B828cD2d": true, // MultichainGlvRouter (CONTROLLER)
      "0xC6782854A8639cC3b40f9497797d6B33797CA592": true, // MultichainGmRouter (CONTROLLER)
      "0xD38111f8aF1A7Cd809457C8A2303e15aE2170724": true, // MultichainOrderRouter (CONTROLLER)
      "0x70AaAd50d53732b2D5534bb57332D00aE20cAd36": true, // MultichainSubaccountRouter (CONTROLLER)
      "0xfaBEb65bB877600be3A2C2a03aA56a95F9f845B9": true, // MultichainTransferRouter (CONTROLLER)
    },
    ROUTER_PLUGIN: {
      "0x1C3fa76e6E1088bCE750f23a5BFcffa1efEF6A41": true, // ExchangeRouter (ROUTER_PLUGIN)
      "0xdD00F639725E19a209880A44962Bc93b51B1B161": true, // SubaccountRouter (ROUTER_PLUGIN)
      "0x7EAdEE2ca1b4D06a0d82fDF03D715550c26AA12F": true, // GlvRouter (ROUTER_PLUGIN)
      "0xa9090E2fd6cD8Ee397cF3106189A7E1CFAE6C59C": true, // GelatoRelayRouter (ROUTER_PLUGIN)
      "0x517602BaC704B72993997820981603f5E4901273": true, // SubaccountGelatoRelayRouter (ROUTER_PLUGIN)
      "0xabcBbe23BD8E0dDD344Ff5fd1439b785B828cD2d": true, // MultichainGlvRouter (ROUTER_PLUGIN)
      "0xC6782854A8639cC3b40f9497797d6B33797CA592": true, // MultichainGmRouter (ROUTER_PLUGIN)
      "0xD38111f8aF1A7Cd809457C8A2303e15aE2170724": true, // MultichainOrderRouter (ROUTER_PLUGIN)
      "0x70AaAd50d53732b2D5534bb57332D00aE20cAd36": true, // MultichainSubaccountRouter (ROUTER_PLUGIN)
      "0xfaBEb65bB877600be3A2C2a03aA56a95F9f845B9": true, // MultichainTransferRouter (ROUTER_PLUGIN)
    },
    ROLE_ADMIN: {
      "0x4bd1cdAab4254fC43ef6424653cA2375b4C94C0E": true, // GMX DAO
      "0x4A1D9e342E2dB5f4a02c9eF5cB29CaF289f31599": true, // TimelockConfig (ROLE_ADMIN)
      "0xC77E6C0ca99E02660A23c00A860Dd5a8912DEaF5": true, // ConfigTimelockController (ROLE_ADMIN)
    },
  };
}
