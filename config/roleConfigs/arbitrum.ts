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
      "0x0765678B4f2B45fa9604264a63762E2fE460df64": true, // general_keeper_2 (retired, still granted on-chain)
      ...claimAdmins.mainnet,
      ...generalConfigKeepers.mainnet,
    },
    CONTRIBUTOR_KEEPER: {
      "0x58F582455b54d7c83d03BCeed95FAf72B37fdDD7": true, // protocol_multisig_1
      "0x49B373D422BdA4C6BfCdd5eC1E48A9a26fdA2F8b": true, // contributor_keeper_1 (retired, still granted on-chain)
    },
    CONTRIBUTOR_DISTRIBUTOR: {
      "0x0765678B4f2B45fa9604264a63762E2fE460df64": true, // general_keeper_2 (retired, still granted on-chain)
      ...generalConfigKeepers.mainnet,
      ...fundDistributors.mainnet,
    },
    CONFIG_KEEPER: {
      "0x8D1d2e24eC641eDC6a1ebe0F3aE7af0EBC573e0D": true, // security_multisig_1
      "0x4C8569E2F8A8Af32E0464E53d76449Ca7a004baF": true, // ConfigSyncer (CONFIG_KEEPER)
      "0x0765678B4f2B45fa9604264a63762E2fE460df64": true, // general_keeper_2 (retired, still granted on-chain)
      ...generalConfigKeepers.mainnet,

      // v2.2c 2026-07-15 (fresh redeploy; live entries above kept until later revoke round)
      "0xC1CB1338775d60b1791b40E7C221C826434e7DCb": true, // ConfigSyncer (CONFIG_KEEPER)
    },
    FEE_KEEPER: {
      "0x43CE1d475e06c65DD879f4ec644B8e0E10ff2b6D": true, // fee_keeper_1
    },
    // FEE_DISTRIBUTION_KEEPER: generalConfigKeepers.mainnet,
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
      "0xF302C3583E4e6D3A34236539Cf7AeAcFdBcD84C4": true, // CollateralFactorManager (OM market only, granted 2026-02)

      "0x33D1a645B9E9fc19b06Fe02981180c8DDAeE75B1": true, // Config (CONTROLLER)
      "0x5cA40cBb5321bBe4EF74Ddf01CCd2b4BCC76a9f9": true, // RiskOracleConfig (CONTROLLER)
      "0x4C8569E2F8A8Af32E0464E53d76449Ca7a004baF": true, // ConfigSyncer (CONTROLLER)
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

      // v2.2c 2026-07-15 (fresh redeploy; live entries above kept until later revoke round)
      "0x233720Ccdec5514e2f5b68500C27A3e17571eF86": true, // Config (CONTROLLER)
      "0xC1CB1338775d60b1791b40E7C221C826434e7DCb": true, // ConfigSyncer (CONTROLLER)
      "0x2Dd99f39f58445CDDC57AA5E0DB2C367335BBD44": true, // ConfigTimelockController (CONTROLLER)
      "0xE7706986A8cec50a2BB8d42D34f8a0404106d4F5": true, // TimelockConfig (CONTROLLER)
      "0x26C02F221e8dB5A821e12347C7eA8a6b6E10842f": true, // Oracle (CONTROLLER)
      "0x7dE39FF2e232A2203196788d37e234cF8F1b83f1": true, // ExchangeRouter (CONTROLLER)
      "0x9c05880A2AaD7530c69e18e342eDC9E06cc757db": true, // SubaccountRouter (CONTROLLER)
      "0x167540D2DFF14120365CfDDF2F86e3045D4fa712": true, // GlvRouter (CONTROLLER)
      "0x5503b99308dB6923758F9A22d118207D633c4e87": true, // GelatoRelayRouter (CONTROLLER)
      "0xfD0596f708d9D950E0eF7b5d191e5F8e55b8a67f": true, // SubaccountGelatoRelayRouter (CONTROLLER)
      "0xaD3051cB1aE3a86b335f12A9a41BD4d995a137ea": true, // SimulationRouter (CONTROLLER)
      "0xa5D2d45228ee2E3A18AB122B2cE84997d008f4Eb": true, // OrderHandler (CONTROLLER)
      "0xCA9313dBBe56309ADdf56C0aed7113eA7B158615": true, // JitOrderHandler (CONTROLLER)
      "0x8f83A77A8f075466904b7B926Dc3C80052A59Ff8": true, // IncreaseOrderExecutor (CONTROLLER)
      "0x05920F5788105eCf4003386904CE9F9DC296dcb7": true, // DecreaseOrderExecutor (CONTROLLER)
      "0x63170C576C0575852BaA3C90F79468b88eC14209": true, // SwapOrderExecutor (CONTROLLER)
      "0x2c60a1890E24a727ccF504A9dA9912ace58b2EAD": true, // DepositHandler (CONTROLLER)
      "0xB25dDF7dE751e5c8bFa85c815d1b379732cF4925": true, // WithdrawalHandler (CONTROLLER)
      "0xC8470eBBb6960FD00Db7D4C9f71CAda27e8f6Bfa": true, // AdlHandler (CONTROLLER)
      "0x01B85C1e0682418f59C4fe37A2cC56c1213C1fa8": true, // LiquidationHandler (CONTROLLER)
      "0xfC260B96E1f80D446bB75785bdDe065Feb1FcEA9": true, // ShiftHandler (CONTROLLER)
      "0xE092bFd05186546fDEAC888f5bCC2c42406d026d": true, // GlvDepositHandler (CONTROLLER)
      "0x45048c62528a6A66FA5CC8D2b25b918701F0FAAA": true, // GlvWithdrawalHandler (CONTROLLER)
      "0xCFf2Afe6E2C3D4d21aDf0e5A5210B94A09546852": true, // GlvShiftHandler (CONTROLLER)
      "0xfF38607a4E1f5F753a317cEb451F7B068df8257b": true, // SwapHandler (CONTROLLER)
      "0xc31E7aC86Cc20FF8D7f4642b5Ed67a43B2AC8426": true, // ClaimHandler (CONTROLLER)
      "0x0B33EBA531e5a5A331a3Ff9F418B8205F01C2869": true, // LayerZeroProvider (CONTROLLER)
      "0x946CC490DFedd6016645F5ce555E0036D116f50e": true, // MultichainClaimsRouter (CONTROLLER)
      "0xA0Ef0Ace6E437458BB4b5F72A7c7bB43a1CdDa8d": true, // MultichainGlvRouter (CONTROLLER)
      "0xFd26a7E3c4A9b75Bd0dce495290Fa33af2bb4b00": true, // MultichainGmRouter (CONTROLLER)
      "0xABFC734f7CFc9352AED7a97b1F6a236eae831e8A": true, // MultichainOrderRouter (CONTROLLER)
      "0xAb3EDf0f3eed6804BAe1bD9bF90109ccadFD262e": true, // MultichainSubaccountRouter (CONTROLLER)
      "0x3f6772B95423fC03264adf90Efb8A9922B6C8c6e": true, // MultichainTransferRouter (CONTROLLER)
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

      // v2.2c 2026-07-15 (fresh redeploy; live entries above kept until later revoke round)
      "0x7dE39FF2e232A2203196788d37e234cF8F1b83f1": true, // ExchangeRouter (ROUTER_PLUGIN)
      "0x9c05880A2AaD7530c69e18e342eDC9E06cc757db": true, // SubaccountRouter (ROUTER_PLUGIN)
      "0x167540D2DFF14120365CfDDF2F86e3045D4fa712": true, // GlvRouter (ROUTER_PLUGIN)
      "0x5503b99308dB6923758F9A22d118207D633c4e87": true, // GelatoRelayRouter (ROUTER_PLUGIN)
      "0xfD0596f708d9D950E0eF7b5d191e5F8e55b8a67f": true, // SubaccountGelatoRelayRouter (ROUTER_PLUGIN)
      "0xaD3051cB1aE3a86b335f12A9a41BD4d995a137ea": true, // SimulationRouter (ROUTER_PLUGIN)
      "0xA0Ef0Ace6E437458BB4b5F72A7c7bB43a1CdDa8d": true, // MultichainGlvRouter (ROUTER_PLUGIN)
      "0xFd26a7E3c4A9b75Bd0dce495290Fa33af2bb4b00": true, // MultichainGmRouter (ROUTER_PLUGIN)
      "0xABFC734f7CFc9352AED7a97b1F6a236eae831e8A": true, // MultichainOrderRouter (ROUTER_PLUGIN)
      "0xAb3EDf0f3eed6804BAe1bD9bF90109ccadFD262e": true, // MultichainSubaccountRouter (ROUTER_PLUGIN)
      "0x3f6772B95423fC03264adf90Efb8A9922B6C8c6e": true, // MultichainTransferRouter (ROUTER_PLUGIN)
    },
    ROLE_ADMIN: {
      "0x4bd1cdAab4254fC43ef6424653cA2375b4C94C0E": true, // GMX DAO
      "0x4A1D9e342E2dB5f4a02c9eF5cB29CaF289f31599": true, // TimelockConfig (ROLE_ADMIN)
      "0xC77E6C0ca99E02660A23c00A860Dd5a8912DEaF5": true, // ConfigTimelockController (ROLE_ADMIN)

      // v2.2c 2026-07-15 (fresh redeploy; live entries above kept until later revoke round)
      "0xE7706986A8cec50a2BB8d42D34f8a0404106d4F5": true, // TimelockConfig (ROLE_ADMIN)
      "0x2Dd99f39f58445CDDC57AA5E0DB2C367335BBD44": true, // ConfigTimelockController (ROLE_ADMIN)
    },
    MULTICHAIN_READER: {},
    RISK_ORACLE: {
      "0x16ffB5a90bE6a0c0c5179d62Ced944fdD8108C72": true, // KMS generated
      "0xB630FDb99b5D50Ef26891E2cf4494027fc4C1289": true,
    },
  };
}
